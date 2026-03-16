import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const db = adminDb();
    const snap = await db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .orderBy('receivedAt', 'desc')
      .limit(50)
      .get();

    const logs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      receivedAt: d.data().receivedAt?.toDate?.()?.toISOString() ?? null,
      processedAt: d.data().processedAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
