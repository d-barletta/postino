import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { AggregateField } from 'firebase-admin/firestore';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const base = db.collection('emailLogs').where('userId', '==', decoded.uid);

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
