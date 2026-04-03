import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { AggregateField } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.split('Bearer ')[1];
  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const base = db.collection('emailLogs').where('userId', '==', uid);

    // Use server-side aggregation queries to avoid reading every document.
    const [
      totalResult,
      forwardedResult,
      errorResult,
      skippedResult,
      aggregateResult,
    ] = await Promise.all([
      base.count().get(),
      base.where('status', '==', 'forwarded').count().get(),
      base.where('status', '==', 'error').count().get(),
      base.where('status', '==', 'skipped').count().get(),
      base.aggregate({
        totalTokensUsed: AggregateField.sum('tokensUsed'),
        totalEstimatedCost: AggregateField.sum('estimatedCost'),
      }).get(),
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
    console.error('[/api/user/stats] Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
