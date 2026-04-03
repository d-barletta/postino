import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { AggregateField } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();

    // Use server-side aggregation queries to avoid reading every document.
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
      db.collection('emailLogs').count().get(),
      db.collection('emailLogs').where('status', '==', 'forwarded').count().get(),
      db.collection('emailLogs').where('status', '==', 'error').count().get(),
      db.collection('emailLogs').where('status', '==', 'skipped').count().get(),
      db
        .collection('emailLogs')
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
