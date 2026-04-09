import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { AggregateField, Timestamp } from 'firebase-admin/firestore';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

type StatsPeriod = '24h' | '7d' | '30d' | 'all';
const VALID_PERIODS = new Set<StatsPeriod>(['24h', '7d', '30d', 'all']);

const PERIOD_MS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') ?? 'all';
    const period: StatsPeriod = VALID_PERIODS.has(periodParam as StatsPeriod)
      ? (periodParam as StatsPeriod)
      : 'all';

    let base = db.collection('emailLogs').where('userId', '==', decoded.uid);
    if (period !== 'all') {
      const from = new Date(Date.now() - PERIOD_MS[period]);
      base = base.where('receivedAt', '>=', Timestamp.fromDate(from)) as typeof base;
    }

    // Use server-side aggregation queries to avoid reading every document.
    const [totalResult, forwardedResult, errorResult, skippedResult, aggregateResult] =
      await Promise.all([
        base.count().get(),
        base.where('status', '==', 'forwarded').count().get(),
        base.where('status', '==', 'error').count().get(),
        base.where('status', '==', 'skipped').count().get(),
        base
          .aggregate({
            totalTokensUsed: AggregateField.sum('tokensUsed'),
            totalEstimatedCost: AggregateField.sum('estimatedCost'),
          })
          .get(),
      ]);

    const stats = {
      totalEmailsReceived: totalResult.data().count,
      totalEmailsForwarded: forwardedResult.data().count,
      totalEmailsError: errorResult.data().count,
      totalEmailsSkipped: skippedResult.data().count,
      // Firestore sum() returns null when no documents match; treat as 0.
      totalTokensUsed: aggregateResult.data().totalTokensUsed ?? 0,
      totalEstimatedCost: aggregateResult.data().totalEstimatedCost ?? 0,
    };

    return NextResponse.json({ stats });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[/api/user/stats] Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
