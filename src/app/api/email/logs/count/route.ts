import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const result = await db.collection('emailLogs').where('userId', '==', decoded.uid).count().get();

    return NextResponse.json({ count: result.data().count });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[email/logs/count] error:', err);
    return NextResponse.json({ error: 'Failed to fetch email count' }, { status: 500 });
  }
}
