import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPendingJobIds } from '@/lib/email-jobs';
import { VERCEL_TIMEOUTS } from '@/lib/vercel-plan';

/**
 * Max function duration: 15 minutes.
 * Wave dispatch must complete within MAX_DISPATCH_MS (10 min). Wave size is
 * auto-calculated: given N total jobs and waveDelayMs between waves, the
 * maximum number of waves that fit is floor(MAX_DISPATCH_MS / waveDelayMs) + 1,
 * and wave size = ceil(N / maxWaves). This guarantees all waves are dispatched
 * before the function times out.
 *
 * Example — 15 jobs, 3-min delay:
 *   maxWaves = floor(600 000 / 180 000) + 1 = 4
 *   waveSize = ceil(15 / 4)              = 4
 *   dispatch time = 3 × 180 000         = 9 min  ✓
 */
//export const maxDuration = 800; //max: 300 in hobby plan and 800 in pro plan

/**
 * Hard budget for dispatching all waves. Wave size is auto-calculated so the
 * final wave is sent before this deadline, leaving the remaining Vercel function
 * time as headroom for the last dispatch call.
 */
const MAX_DISPATCH_MS = VERCEL_TIMEOUTS.emailJobsDispatchBudgetMs;

/** Default delay between waves in milliseconds (3 minutes). */
const DEFAULT_WAVE_DELAY_MS = 3 * 60 * 1000;
/** Default total number of jobs to query and dispatch in a single run. */
const DEFAULT_BATCH_SIZE = 10;

/**
 * Compute how many jobs to put in each wave so that all waves fit inside
 * MAX_DISPATCH_MS given the configured delay between waves.
 */
function computeWaveSize(totalJobs: number, waveDelayMs: number): number {
  if (totalJobs <= 0) return 1;
  // +1 because the first wave has no preceding delay
  const maxWaves = waveDelayMs > 0 ? Math.floor(MAX_DISPATCH_MS / waveDelayMs) + 1 : totalJobs;
  return Math.ceil(totalJobs / Math.max(maxWaves, 1));
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

const MIN_SECRET_LENGTH = 16;

function isAuthorized(request: NextRequest): boolean {
  const workerSecret = process.env.EMAIL_JOBS_WORKER_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || '';

  const workerHeader = request.headers.get('x-worker-secret') || '';
  if (
    workerSecret.length >= MIN_SECRET_LENGTH &&
    timingSafeStringEqual(workerHeader, workerSecret)
  ) {
    return true;
  }

  if (cronSecret.length >= MIN_SECRET_LENGTH) {
    const authHeader = request.headers.get('authorization') || '';
    const expectedCronHeader = `Bearer ${cronSecret}`;
    if (timingSafeStringEqual(authHeader, expectedCronHeader)) {
      return true;
    }
  }

  return false;
}

function resolveNumber(
  queryValue: string | null,
  bodyValue: number | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const raw =
    typeof bodyValue === 'number'
      ? bodyValue
      : queryValue !== null
        ? Number.parseInt(queryValue, 10)
        : defaultValue;
  const parsed = Number.isFinite(raw) ? Math.floor(raw) : defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBaseUrl(request: NextRequest): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (appUrl) return appUrl;
  const host = request.headers.get('host') || 'localhost:3000';
  const proto =
    request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function buildAuthHeaders(): Record<string, string> {
  const workerSecret = process.env.EMAIL_JOBS_WORKER_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (workerSecret.length >= MIN_SECRET_LENGTH) {
    headers['x-worker-secret'] = workerSecret;
  } else if (cronSecret.length >= MIN_SECRET_LENGTH) {
    headers['Authorization'] = `Bearer ${cronSecret}`;
  }
  return headers;
}

interface ProcessBody {
  /**
   * Total number of emails to process in this run.
   * Wave size is auto-calculated so all waves fit within the 10-minute dispatch budget.
   * Maps to the `?batchSize=` query param used by the existing cron config.
   */
  batchSize?: number;
  /** Override inter-wave delay in ms (default: 3 minutes). */
  waveDelayMs?: number;
}

async function handleProcess(request: NextRequest, body?: ProcessBody) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);

  const batchSize = resolveNumber(
    url.searchParams.get('batchSize'),
    body?.batchSize,
    DEFAULT_BATCH_SIZE,
    1,
    50,
  );
  const waveDelayMs = resolveNumber(
    url.searchParams.get('waveDelayMs'),
    body?.waveDelayMs,
    DEFAULT_WAVE_DELAY_MS,
    0,
    MAX_DISPATCH_MS,
  );

  const jobIds = await getPendingJobIds(batchSize);

  if (jobIds.length === 0) {
    return NextResponse.json({ success: true, totalJobs: 0, wavesDispatched: 0, dispatched: 0 });
  }

  // Auto-calculate wave size: spread all jobs across the maximum number of
  // waves that fit within the 10-minute dispatch budget.
  const waveSize = computeWaveSize(jobIds.length, waveDelayMs);

  // Split into waves of waveSize.
  const waves: string[][] = [];
  for (let i = 0; i < jobIds.length; i += waveSize) {
    waves.push(jobIds.slice(i, i + waveSize));
  }

  const processOneUrl = `${buildBaseUrl(request)}/api/internal/email-jobs/process-one`;
  const authHeaders = buildAuthHeaders();
  let dispatched = 0;

  console.log(
    `[internal/email-jobs/process] dispatching ${jobIds.length} job(s) in ${waves.length} wave(s)`,
    { batchSize, waveSize, waveDelayMs },
  );

  for (let i = 0; i < waves.length; i++) {
    if (i > 0) {
      await delay(waveDelayMs);
    }

    const waveResults = await Promise.allSettled(
      waves[i].map(async (jobId) => {
        const res = await fetch(processOneUrl, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ jobId }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`process-one responded ${res.status}: ${text}`);
        }
        return (await res.json()) as { claimed: boolean; jobId: string };
      }),
    );

    for (const result of waveResults) {
      if (result.status === 'fulfilled' && result.value.claimed) {
        dispatched++;
      } else if (result.status === 'rejected') {
        console.error(`[internal/email-jobs/process] wave ${i} dispatch error:`, result.reason);
      }
    }

    console.log(`[internal/email-jobs/process] wave ${i + 1}/${waves.length} dispatched`, {
      jobsInWave: waves[i].length,
    });
  }

  return NextResponse.json({
    success: true,
    totalJobs: jobIds.length,
    wavesDispatched: waves.length,
    dispatched,
  });
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ProcessBody;
  return handleProcess(request, body);
}
