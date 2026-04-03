import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
    const result = await db
      .collection('emailLogs')
      .where('userId', '==', uid)
      .count()
      .get();

    return NextResponse.json({ count: result.data().count });
  } catch (err) {
    console.error('[email/logs/count] error:', err);
    return NextResponse.json({ error: 'Failed to fetch email count' }, { status: 500 });
  }
}
