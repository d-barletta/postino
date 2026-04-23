import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { claimJobById, processSingleClaimedJob } from '@/lib/email-jobs';

/**
 * Max function duration: 12 minutes.
 * This route waits for full job processing so sandbox execution completes
 * before returning to the caller.
 */
export const maxDuration = 300;

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

async function handleProcessOne(request: NextRequest, bodyJobId?: string) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = bodyJobId ?? url.searchParams.get('jobId') ?? '';

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const workerId = `p1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = await claimJobById(jobId, workerId);

  if (!job) {
    // Job not found or already claimed by another worker — not an error.
    return NextResponse.json({ claimed: false, jobId });
  }

  try {
    await processSingleClaimedJob(job);
    return NextResponse.json({ claimed: true, jobId });
  } catch (err) {
    console.error('[process-one] processSingleClaimedJob unhandled error (job:', job.id, '):', err);
    return NextResponse.json({ error: 'Worker failed', jobId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  return handleProcessOne(request, body.jobId);
}

export async function GET(request: NextRequest) {
  return handleProcessOne(request);
}
