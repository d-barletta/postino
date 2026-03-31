import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;

    // Check ownership: must be the owner or an admin
    if (data.userId !== decoded.uid) {
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    await db.collection('emailLogs').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const isAuthError =
      msg.includes('auth') ||
      msg.includes('token') ||
      msg.includes('Firebase') ||
      msg === 'Unauthorized' ||
      msg === 'Forbidden';
    if (isAuthError) {
      const status = msg === 'Forbidden' ? 403 : 401;
      return NextResponse.json({ error: msg }, { status });
    }
    console.error('Error deleting email:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
