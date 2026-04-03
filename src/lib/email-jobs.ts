import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import {
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  type QueuedInboundPayload,
} from '@/lib/inbound-processing';

export type EmailJobStatus = 'pending' | 'processing' | 'retrying' | 'done' | 'failed';

async function updateWebhookLogForJob(jobId: string, status: string, result?: string): Promise<void> {
  const db = adminDb();
  try {
    const snap = await db
      .collection('mailgunWebhookLogs')
      .where('linked.jobId', '==', jobId)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        status,
        ...(result !== undefined ? { result } : {}),
        updatedAt: Timestamp.now(),
      });
    }
  } catch (err) {
    console.error('Failed to update webhook log status for job', jobId, err);
  }
}

interface EmailJob {
  status: EmailJobStatus;
  payload: QueuedInboundPayload;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  notBefore?: FirebaseFirestore.Timestamp;
  lockUntil?: FirebaseFirestore.Timestamp;
  lockedBy?: string;
  lastError?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 90_000;
const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;

function computeRetryDelayMs(attempts: number): number {
  const idx = Math.max(0, Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[idx];
}

export async function enqueueEmailJob(payload: QueuedInboundPayload, idempotencyKey: string): Promise<boolean> {
  const db = adminDb();
  const now = Timestamp.now();
  const jobRef = db.collection('emailJobs').doc(idempotencyKey);

  try {
    await jobRef.create({
      status: 'pending',
      payload,
      idempotencyKey,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
    } as EmailJob);
    return true;
  } catch {
    return false;
  }
}

async function claimJob(
  jobId: string,
  workerId: string,
  now: Date
): Promise<(EmailJob & { id: string }) | null> {
  const db = adminDb();
  const jobRef = db.collection('emailJobs').doc(jobId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;

    const data = snap.data() as EmailJob;

    // Accept pending/retrying jobs, or processing jobs whose lease has expired.
    const isClaimableStatus =
      data.status === 'pending' ||
      data.status === 'retrying' ||
      data.status === 'processing';
    if (!isClaimableStatus) return null;

    if ((data.lockUntil?.toMillis?.() ?? 0) > now.getTime()) return null;

    const notBeforeMs = data.notBefore?.toMillis?.() ?? 0;
    if (notBeforeMs > now.getTime()) return null;

    const attempts = (typeof data.attempts === 'number' ? data.attempts : 0) + 1;

    tx.update(jobRef, {
      status: 'processing',
      attempts,
      lockedBy: workerId,
      lockUntil: Timestamp.fromMillis(now.getTime() + CLAIM_LEASE_MS),
      updatedAt: Timestamp.now(),
    });

    return {
      ...data,
      id: jobId,
      attempts,
      status: 'processing',
      lockedBy: workerId,
      lockUntil: Timestamp.fromMillis(now.getTime() + CLAIM_LEASE_MS),
    };
  });
}

async function markJobDone(jobId: string): Promise<void> {
  const db = adminDb();
  await db.collection('emailJobs').doc(jobId).update({
    status: 'done',
    lockUntil: null,
    lockedBy: null,
    updatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  });
  await updateWebhookLogForJob(jobId, 'processed', 'done');
}

async function markJobRetry(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const db = adminDb();
  const delayMs = computeRetryDelayMs(job.attempts);
  const notBefore = Timestamp.fromMillis(Date.now() + delayMs);

  // Update the email log first so that even if the job status update fails, the
  // log reflects a non-stuck state. The job will remain re-claimable via lease
  // expiry and will be retried on the next worker run.
  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'received',
    errorMessage: `Retry scheduled after failure (${job.attempts}/${job.maxAttempts}): ${errMsg}`,
  });

  await db.collection('emailJobs').doc(job.id).update({
    status: 'retrying',
    lastError: errMsg,
    notBefore,
    lockUntil: null,
    lockedBy: null,
    updatedAt: Timestamp.now(),
  });

  await updateWebhookLogForJob(job.id, 'retrying', 'retrying');
}

async function markJobFailed(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const db = adminDb();

  // Update the email log first so that even if the job status update fails, the
  // log reflects the error and does not stay stuck in 'processing' permanently.
  // A job whose status update fails here will remain re-claimable via lease expiry;
  // the idempotency guard will then recognise the terminal log state and mark it done.
  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'error',
    errorMessage: errMsg,
  });

  await db.collection('emailJobs').doc(job.id).update({
    status: 'failed',
    lastError: errMsg,
    lockUntil: null,
    lockedBy: null,
    updatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  });

  await sendEmailCompletionPushNotification(
    job.payload.userId,
    job.payload.sender,
    job.payload.subject,
    job.payload.logId,
    'error'
  );
  await updateWebhookLogForJob(job.id, 'failed', 'failed');
}

async function processClaimedJob(job: EmailJob & { id: string }): Promise<void> {
  const db = adminDb();

  // Idempotency guard: read the current log status BEFORE overwriting it so we
  // can detect cases where a previous worker already completed this job (e.g. the
  // job lease expired after a successful forward but before markJobDone ran).
  // Terminal states: forwarded / error / skipped → skip re-processing, just close
  // the job so it is not re-queued.
  const logSnap = await db.collection('emailLogs').doc(job.payload.logId).get();
  const currentLogStatus = logSnap.exists ? (logSnap.data()?.status as string | undefined) : undefined;
  if (currentLogStatus === 'forwarded' || currentLogStatus === 'error' || currentLogStatus === 'skipped') {
    await markJobDone(job.id);
    return;
  }

  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'processing',
    processingStartedAt: Timestamp.now(),
  });
  await updateWebhookLogForJob(job.id, 'processing', 'processing');

  try {
    await processQueuedInboundPayload(job.payload);
    // The email was forwarded successfully (processQueuedInboundPayload updated the
    // log status). Catch markJobDone failures in isolation so that a transient
    // Firestore error here does not cascade into the error/retry path and
    // overwrite the 'forwarded' log status with 'error' or 'received'.
    try {
      await markJobDone(job.id);
    } catch (doneErr) {
      console.error('Failed to mark job done after successful processing (job:', job.id, '):', doneErr);
      // The job lease will expire and it will be re-claimed; the idempotency guard
      // above will then recognise the 'forwarded' log state and mark it done.
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    if (job.attempts >= job.maxAttempts) {
      await markJobFailed(job, errMsg);
      return;
    }

    await markJobRetry(job, errMsg);
  }
}

export async function processEmailJobsBatch(batchSize = 10): Promise<{
  claimed: number;
  processed: number;
  failed: number;
}> {
  const db = adminDb();
  const now = new Date();
  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  const candidatesSnap = await db
    .collection('emailJobs')
    .where('status', 'in', ['pending', 'retrying', 'processing'])
    .limit(Math.max(batchSize * 3, 15))
    .get();

  let claimed = 0;
  let processed = 0;
  let failed = 0;

  for (const candidate of candidatesSnap.docs) {
    if (claimed >= batchSize) break;

    const job = await claimJob(candidate.id, workerId, now);
    if (!job) continue;

    claimed += 1;

    try {
      await processClaimedJob(job);
      const updated = await db.collection('emailJobs').doc(job.id).get();
      const status = updated.data()?.status as EmailJobStatus | undefined;
      if (status === 'failed') {
        failed += 1;
      } else {
        processed += 1;
      }
    } catch (err) {
      failed += 1;
      // Rescue the job so it doesn't remain stuck in 'processing' forever.
      const errMsg = err instanceof Error ? err.message : String(err);
      try {
        if (job.attempts >= job.maxAttempts) {
          await markJobFailed(job, errMsg);
        } else {
          await markJobRetry(job, errMsg);
        }
      } catch {
        // Best-effort; lease expiry will allow reclaiming on the next run.
        console.error('Failed to rescue job', job.id, 'after processing error:', err);
      }
    }
  }

  return { claimed, processed, failed };
}
