import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { AggregateField } from 'firebase-admin/firestore';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
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
      db.collection('emailLogs').aggregate({
        totalTokensUsed: AggregateField.sum('tokensUsed'),
        totalEstimatedCost: AggregateField.sum('estimatedCost'),
      }).get(),
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
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
