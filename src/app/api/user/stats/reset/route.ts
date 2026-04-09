import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

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
    return handleUserError(err, 'user/stats/reset POST');
  }
}
