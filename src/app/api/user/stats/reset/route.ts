import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

const BATCH_SIZE = 400;

export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyUserRequest(request);
    const db = adminDb();
    const logsSnap = await db.collection('emailLogs').where('userId', '==', uid).get();

    for (let i = 0; i < logsSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      logsSnap.docs.slice(i, i + BATCH_SIZE).forEach((doc) => {
        batch.update(doc.ref, {
          tokensUsed: 0,
          estimatedCost: 0,
        });
      });
      await batch.commit();
    }

    return NextResponse.json({ success: true, updatedCount: logsSnap.size });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[user/stats/reset] Failed to reset token and cost stats:', err);
    return NextResponse.json({ error: 'Failed to reset stats' }, { status: 500 });
  }
}
