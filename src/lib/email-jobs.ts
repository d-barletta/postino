import { createAdminClient } from '@/lib/supabase/admin';
import {
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  type QueuedInboundPayload,
} from '@/lib/inbound-processing';

export type EmailJobStatus = 'pending' | 'processing' | 'retrying' | 'done' | 'failed';

async function updateWebhookLogForJob(
  jobId: string,
  status: string,
  result?: string,
): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { data: rows } = await supabase
      .from('mailgun_webhook_logs')
      .select('id')
      .filter('linked->>jobId', 'eq', jobId)
      .limit(1);
    if (rows && rows.length > 0) {
      await supabase
        .from('mailgun_webhook_logs')
        .update({
          status,
          ...(result !== undefined ? { result } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rows[0].id);
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
  notBefore?: string;
  lockUntil?: string;
  lockedBy?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 90_000;
const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000] as const;

function computeRetryDelayMs(attempts: number): number {
  const idx = Math.max(0, Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[idx];
}

export async function enqueueEmailJob(
  payload: QueuedInboundPayload,
  idempotencyKey: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  try {
    const { error } = await supabase.from('email_jobs').insert({
      id: idempotencyKey,
      status: 'pending',
      payload: payload as unknown as import('@/types/supabase').Json,
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      created_at: now,
      updated_at: now,
    });
    // If insert fails due to duplicate key, return false (already enqueued)
    return !error;
  } catch {
    return false;
  }
}

async function claimJob(
  jobId: string,
  workerId: string,
  now: Date,
): Promise<(EmailJob & { id: string }) | null> {
  const supabase = createAdminClient();
  const leaseEnd = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();

  const { data: result } = await supabase.rpc('claim_email_job', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_now: now.toISOString(),
    p_lease_end: leaseEnd,
  });

  if (!result) return null;

  // claim_email_job returns the claimed job as JSONB or null
  const claimed = result as unknown as (EmailJob & { id: string }) | null;
  if (!claimed || !claimed.id) return null;

  return claimed;
}

async function markJobDone(jobId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from('email_jobs')
    .update({
      status: 'done',
      lock_until: null,
      locked_by: null,
      updated_at: now,
      completed_at: now,
    })
    .eq('id', jobId);
  await updateWebhookLogForJob(jobId, 'processed', 'done');
}

async function markJobRetry(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const supabase = createAdminClient();
  const delayMs = computeRetryDelayMs(job.attempts);
  const notBefore = new Date(Date.now() + delayMs).toISOString();
  const now = new Date().toISOString();

  await supabase
    .from('email_logs')
    .update({
      status: 'received',
      error_message: `Retry scheduled after failure (${job.attempts}/${job.maxAttempts}): ${errMsg}`,
    })
    .eq('id', job.payload.logId);

  await supabase
    .from('email_jobs')
    .update({
      status: 'retrying',
      last_error: errMsg,
      not_before: notBefore,
      lock_until: null,
      locked_by: null,
      updated_at: now,
    })
    .eq('id', job.id);

  await updateWebhookLogForJob(job.id, 'retrying', 'retrying');
}

async function markJobFailed(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await supabase
    .from('email_logs')
    .update({ status: 'error', error_message: errMsg })
    .eq('id', job.payload.logId);

  await supabase
    .from('email_jobs')
    .update({
      status: 'failed',
      last_error: errMsg,
      lock_until: null,
      locked_by: null,
      updated_at: now,
      completed_at: now,
    })
    .eq('id', job.id);

  await sendEmailCompletionPushNotification(
    job.payload.userId,
    job.payload.sender,
    job.payload.subject,
    job.payload.logId,
    'error',
  );
  await updateWebhookLogForJob(job.id, 'failed', 'failed');
}

async function processClaimedJob(job: EmailJob & { id: string }): Promise<void> {
  const supabase = createAdminClient();

  console.log('[email-jobs] processClaimedJob start', {
    jobId: job.id,
    logId: job.payload.logId,
    userId: job.payload.userId,
    attempts: job.attempts,
    payloadAttachmentCount: job.payload.attachments?.length ?? 0,
    payloadAttachmentNames: job.payload.attachments?.map((a) => a.filename) ?? [],
    payloadAttachmentStoragePaths: job.payload.attachments?.map((a) => a.storagePath ?? null) ?? [],
  });

  const { data: logRow } = await supabase
    .from('email_logs')
    .select('status')
    .eq('id', job.payload.logId)
    .single();
  const currentLogStatus = logRow?.status as string | undefined;
  if (
    currentLogStatus === 'forwarded' ||
    currentLogStatus === 'error' ||
    currentLogStatus === 'skipped'
  ) {
    await markJobDone(job.id);
    return;
  }

  const now = new Date().toISOString();
  await supabase
    .from('email_logs')
    .update({ status: 'processing', processing_started_at: now })
    .eq('id', job.payload.logId);
  await updateWebhookLogForJob(job.id, 'processing', 'processing');

  try {
    await processQueuedInboundPayload(job.payload);
    try {
      await markJobDone(job.id);
    } catch (doneErr) {
      console.error(
        'Failed to mark job done after successful processing (job:',
        job.id,
        '):',
        doneErr,
      );
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
  const supabase = createAdminClient();
  const now = new Date();
  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

  const { data: candidates } = await supabase
    .from('email_jobs')
    .select(
      'id, status, attempts, max_attempts, payload, lock_until, not_before, locked_by, last_error, created_at, updated_at, completed_at',
    )
    .in('status', ['pending', 'retrying', 'processing'])
    .limit(Math.max(batchSize * 3, 15));

  let claimed = 0;
  let processed = 0;
  let failed = 0;

  for (const candidate of candidates ?? []) {
    if (claimed >= batchSize) break;

    const job = await claimJob(candidate.id, workerId, now);
    if (!job) continue;

    claimed += 1;

    try {
      await processClaimedJob(job);
      const { data: updated } = await supabase
        .from('email_jobs')
        .select('status')
        .eq('id', job.id)
        .single();
      const status = updated?.status as EmailJobStatus | undefined;
      if (status === 'failed') {
        failed += 1;
      } else {
        processed += 1;
      }
    } catch (err) {
      failed += 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      try {
        if (job.attempts >= job.maxAttempts) {
          await markJobFailed(job, errMsg);
        } else {
          await markJobRetry(job, errMsg);
        }
      } catch {
        console.error('Failed to rescue job', job.id, 'after processing error:', err);
      }
    }
  }

  return { claimed, processed, failed };
}
