import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const result = await db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .count()
      .get();

    return NextResponse.json({ count: result.data().count });
  } catch (err) {
    return handleUserError(err, 'email/logs/count GET');
  }
}
