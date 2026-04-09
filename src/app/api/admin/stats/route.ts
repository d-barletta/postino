import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { AggregateField, Timestamp } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';

type StatsPeriod = '24h' | '7d' | '30d' | 'all';
const VALID_PERIODS = new Set<StatsPeriod>(['24h', '7d', '30d', 'all']);

const PERIOD_MS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') ?? 'all';
    const period: StatsPeriod = VALID_PERIODS.has(periodParam as StatsPeriod)
      ? (periodParam as StatsPeriod)
      : 'all';

    let emailBase = db.collection('emailLogs') as FirebaseFirestore.Query;
    if (period !== 'all') {
      const from = new Date(Date.now() - PERIOD_MS[period]);
      emailBase = db.collection('emailLogs').where('receivedAt', '>=', Timestamp.fromDate(from));
    }
    const filteredBase = emailBase;

    // Use server-side aggregation queries to avoid reading every document.
    // totalUsers and activeUsers are always all-time counts (not filtered by period).
    const [
      totalUsersResult,
      activeUsersResult,
      totalEmailsResult,
      forwardedResult,
      errorResult,
      skippedResult,
      emailAggResult,
    ] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('users').where('isActive', '==', true).count().get(),
      filteredBase.count().get(),
      filteredBase.where('status', '==', 'forwarded').count().get(),
      filteredBase.where('status', '==', 'error').count().get(),
      filteredBase.where('status', '==', 'skipped').count().get(),
      filteredBase
        .aggregate({
          totalTokensUsed: AggregateField.sum('tokensUsed'),
          totalEstimatedCost: AggregateField.sum('estimatedCost'),
        })
        .get(),
    ]);

    const stats = {
      totalUsers: totalUsersResult.data().count,
      activeUsers: activeUsersResult.data().count,
      totalEmailsReceived: totalEmailsResult.data().count,
      totalEmailsForwarded: forwardedResult.data().count,
      totalEmailsError: errorResult.data().count,
      totalEmailsSkipped: skippedResult.data().count,
      totalTokensUsed: emailAggResult.data().totalTokensUsed ?? 0,
      totalEstimatedCost: emailAggResult.data().totalEstimatedCost ?? 0,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/stats] error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
