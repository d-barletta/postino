import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';

type Granularity = 'hour' | 'day' | 'week';
type Range = '24h' | '7d' | '30d';

function getBucketKey(date: Date, granularity: Granularity): string {
  const d = new Date(date);
  if (granularity === 'hour') {
    d.setMinutes(0, 0, 0);
  } else if (granularity === 'day') {
    d.setHours(0, 0, 0, 0);
  } else {
    // week: floor to Monday
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

const RANGE_MS: Record<Range, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const VALID_RANGES = new Set<Range>(['24h', '7d', '30d']);
const VALID_GRANULARITIES = new Set<Granularity>(['hour', 'day', 'week']);

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();
    const { searchParams } = new URL(request.url);

    const rangeParam = searchParams.get('range') ?? '7d';
    const granularityParam = searchParams.get('granularity') ?? 'day';
    const range: Range = VALID_RANGES.has(rangeParam as Range) ? (rangeParam as Range) : '7d';
    const granularity: Granularity = VALID_GRANULARITIES.has(granularityParam as Granularity)
      ? (granularityParam as Granularity)
      : 'day';

    const from = new Date(Date.now() - RANGE_MS[range]);

    const snap = await db
      .collection('emailLogs')
      .where('receivedAt', '>=', Timestamp.fromDate(from))
      .orderBy('receivedAt', 'asc')
      .limit(10000)
      .get();

    type BucketData = {
      received: number;
      processing: number;
      forwarded: number;
      error: number;
      skipped: number;
      cost: number;
    };

    const bucketMap = new Map<string, BucketData>();

    for (const doc of snap.docs) {
      const data = doc.data();
      const receivedAt: Date | undefined = data.receivedAt?.toDate?.();
      if (!receivedAt) continue;

      const key = getBucketKey(receivedAt, granularity);
      const existing: BucketData = bucketMap.get(key) ?? {
        received: 0,
        processing: 0,
        forwarded: 0,
        error: 0,
        skipped: 0,
        cost: 0,
      };

      const status = data.status as string;
      if (status === 'received') existing.received++;
      else if (status === 'forwarded') existing.forwarded++;
      else if (status === 'error') existing.error++;
      else if (status === 'skipped') existing.skipped++;
      else if (status === 'processing') existing.processing++;
      // unknown/missing status: not counted

      existing.cost += data.estimatedCost || 0;
      bucketMap.set(key, existing);
    }

    const buckets = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, counts]) => ({
        bucket,
        received: counts.received,
        processing: counts.processing,
        forwarded: counts.forwarded,
        error: counts.error,
        skipped: counts.skipped,
        cost: Number(counts.cost.toFixed(6)),
      }));

    return NextResponse.json({ buckets });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/stats/timeseries] error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
