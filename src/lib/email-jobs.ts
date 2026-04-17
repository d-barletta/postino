import { createAdminClient } from '@/lib/supabase/admin';
import {
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  type QueuedInboundPayload,
} from '@/lib/inbound-processing';
import { analyzeEmailContent } from '@/agents/email-agent';

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

export interface EmailJob {
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
  const base = RETRY_BACKOFF_MS[idx];
  // Add ±15 % jitter to spread out retries from concurrent workers and avoid thundering herds.
  const jitter = base * 0.15 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
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
  const { error } = await supabase
    .from('email_jobs')
    .update({
      status: 'done',
      lock_until: null,
      locked_by: null,
      updated_at: now,
      completed_at: now,
    })
    .eq('id', jobId);
  if (error) console.error('[email-jobs] markJobDone failed (job:', jobId, '):', error);
  await updateWebhookLogForJob(jobId, 'processed', 'done');
}

async function markJobRetry(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const supabase = createAdminClient();
  const delayMs = computeRetryDelayMs(job.attempts);
  const notBefore = new Date(Date.now() + delayMs).toISOString();
  const now = new Date().toISOString();

  const { error: logErr } = await supabase
    .from('email_logs')
    .update({
      status: 'received',
      error_message: `Retry scheduled after failure (${job.attempts}/${job.maxAttempts}): ${errMsg}`,
    })
    .eq('id', job.payload.logId);
  if (logErr)
    console.error(
      '[email-jobs] markJobRetry: email_log update failed (log:',
      job.payload.logId,
      '):',
      logErr,
    );

  const { error: jobErr } = await supabase
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
  if (jobErr)
    console.error('[email-jobs] markJobRetry: email_job update failed (job:', job.id, '):', jobErr);

  await updateWebhookLogForJob(job.id, 'retrying', 'retrying');
}

async function markJobFailed(job: EmailJob & { id: string }, errMsg: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: logErr } = await supabase
    .from('email_logs')
    .update({ status: 'error', error_message: errMsg })
    .eq('id', job.payload.logId);
  if (logErr)
    console.error(
      '[email-jobs] markJobFailed: email_log update failed (log:',
      job.payload.logId,
      '):',
      logErr,
    );

  const { error: jobErr } = await supabase
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
  if (jobErr)
    console.error(
      '[email-jobs] markJobFailed: email_job update failed (job:',
      job.id,
      '):',
      jobErr,
    );

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
  const { error: procErr } = await supabase
    .from('email_logs')
    .update({ status: 'processing', processing_started_at: now })
    .eq('id', job.payload.logId);
  if (procErr)
    console.error(
      '[email-jobs] processClaimedJob: email_log status update failed (log:',
      job.payload.logId,
      '):',
      procErr,
    );
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
    .order('created_at', { ascending: true })
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

// ---------------------------------------------------------------------------
// Single-job processing helpers (used by the process-one route)
// ---------------------------------------------------------------------------

/**
 * Run a quick pre-analysis pass and persist the result to `email_logs.email_analysis`
 * so the user can see partial results while the full sandbox/agent is still running.
 * Best-effort — never throws.
 */
async function runEarlyAnalysisAndSave(
  payload: QueuedInboundPayload,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  // Analysis-only jobs don't use sandbox, so early save isn't needed.
  if (payload.aiAnalysisOnly) return;
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('analysis_output_language')
      .eq('id', payload.userId)
      .single();
    const analysisOutputLanguage =
      typeof userRow?.analysis_output_language === 'string'
        ? userRow.analysis_output_language || undefined
        : undefined;

    const result = await analyzeEmailContent(
      payload.sender,
      payload.subject,
      payload.emailBody,
      payload.bodyHtml !== '',
      undefined,
      analysisOutputLanguage,
    );

    if (result.analysis) {
      await supabase
        .from('email_logs')
        .update({
          email_analysis: result.analysis as unknown as import('@/types/supabase').Json,
        })
        .eq('id', payload.logId);
    }
  } catch (err) {
    console.error('[email-jobs] runEarlyAnalysisAndSave failed (log:', payload.logId, '):', err);
  }
}

/**
 * Attempt to claim a single job by ID for processing.
 * Returns the claimed job or `null` when the job cannot be claimed
 * (already locked by another worker, not yet due, or not found).
 */
export async function claimJobById(
  jobId: string,
  workerId: string,
): Promise<(EmailJob & { id: string }) | null> {
  return claimJob(jobId, workerId, new Date());
}

/**
 * Process a previously claimed job with an early analysis pass.
 *
 * Differences from `processClaimedJob` (used by the batch path):
 * - Runs `analyzeEmailContent` and saves the result to the DB **before** calling
 *   the full agent/sandbox, so the user can see partial analysis in real time.
 * - Designed to be called inside `after()` so it runs after the HTTP response
 *   has been sent by the `process-one` route.
 */
export async function processSingleClaimedJob(job: EmailJob & { id: string }): Promise<void> {
  const supabase = createAdminClient();

  console.log('[email-jobs] processSingleClaimedJob start', {
    jobId: job.id,
    logId: job.payload.logId,
    userId: job.payload.userId,
    attempts: job.attempts,
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
  const { error: procErr } = await supabase
    .from('email_logs')
    .update({ status: 'processing', processing_started_at: now })
    .eq('id', job.payload.logId);
  if (procErr)
    console.error(
      '[email-jobs] processSingleClaimedJob: email_log status update failed (log:',
      job.payload.logId,
      '):',
      procErr,
    );
  await updateWebhookLogForJob(job.id, 'processing', 'processing');

  // Save early analysis so the UI can show partial results while the
  // sandbox/agent is still running.
  await runEarlyAnalysisAndSave(job.payload, supabase);

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

/**
 * Return the IDs of jobs that are eligible for processing right now.
 * Jobs are not claimed — use `claimJobById` to acquire each one before processing.
 */
export async function getPendingJobIds(limit: number): Promise<string[]> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('email_jobs')
    .select('id')
    .in('status', ['pending', 'retrying', 'processing'])
    .or(`not_before.is.null,not_before.lte.${now}`)
    .or(`lock_until.is.null,lock_until.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []).map((row) => row.id as string);
}
