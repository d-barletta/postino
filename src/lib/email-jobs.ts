import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import {
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  type QueuedInboundPayload,
} from '@/lib/inbound-processing';

export type EmailJobStatus = 'pending' | 'processing' | 'retrying' | 'done' | 'failed';

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
    if (data.status !== 'pending' && data.status !== 'retrying') return null;

    const lockUntilMs = data.lockUntil?.toMillis?.() ?? 0;
    if (lockUntilMs > now.getTime()) return null;

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
}

async function markJobRetry(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const db = adminDb();
  const delayMs = computeRetryDelayMs(job.attempts);
  const notBefore = Timestamp.fromMillis(Date.now() + delayMs);

  await db.collection('emailJobs').doc(job.id).update({
    status: 'retrying',
    lastError: errMsg,
    notBefore,
    lockUntil: null,
    lockedBy: null,
    updatedAt: Timestamp.now(),
  });

  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'received',
    errorMessage: `Retry scheduled after failure (${job.attempts}/${job.maxAttempts}): ${errMsg}`,
  });
}

async function markJobFailed(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const db = adminDb();

  await db.collection('emailJobs').doc(job.id).update({
    status: 'failed',
    lastError: errMsg,
    lockUntil: null,
    lockedBy: null,
    updatedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  });

  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'error',
    errorMessage: errMsg,
  });

  await sendEmailCompletionPushNotification(
    job.payload.userId,
    job.payload.sender,
    job.payload.subject,
    job.payload.logId,
    'error'
  );
}

async function processClaimedJob(job: EmailJob & { id: string }): Promise<void> {
  const db = adminDb();

  await db.collection('emailLogs').doc(job.payload.logId).update({
    status: 'processing',
    processingStartedAt: Timestamp.now(),
  });

  // Idempotency guard: if the log is already forwarded, skip side effects.
  const logSnap = await db.collection('emailLogs').doc(job.payload.logId).get();
  if (logSnap.exists && logSnap.data()?.status === 'forwarded') {
    await markJobDone(job.id);
    return;
  }

  try {
    await processQueuedInboundPayload(job.payload);
    await markJobDone(job.id);
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
    .where('status', 'in', ['pending', 'retrying'])
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
    } catch {
      failed += 1;
    }
  }

  return { claimed, processed, failed };
}
