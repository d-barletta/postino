import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { processEmailJobsBatch } from '@/lib/email-jobs';

function timingSafeStringEqual(a: string, b: string): boolean {
  // Hash both values to a fixed-length digest before comparing so that
  // neither string length nor short-circuit evaluation leaks timing information.
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/** Minimum acceptable length for shared secrets to prevent trivially guessable values. */
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

function resolveBatchSize(request: NextRequest, bodyBatchSize?: number): number {
  const url = new URL(request.url);
  const queryBatchSize = Number.parseInt(url.searchParams.get('batchSize') || '', 10);
  const rawBatchSize = Number.isFinite(queryBatchSize)
    ? queryBatchSize
    : typeof bodyBatchSize === 'number'
      ? Math.floor(bodyBatchSize)
      : 10;

  return Math.min(Math.max(rawBatchSize, 1), 50);
}

async function handleProcess(request: NextRequest, bodyBatchSize?: number) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const batchSize = resolveBatchSize(request, bodyBatchSize);

    const result = await processEmailJobsBatch(batchSize);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Worker failed';
    console.error('[internal/email-jobs/process] error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { batchSize?: number };
  return handleProcess(request, body.batchSize);
}
