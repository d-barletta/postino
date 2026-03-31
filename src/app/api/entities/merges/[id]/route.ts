import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  return adminAuth().verifyIdToken(token);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await verifyUser(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing merge ID' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('entityMerges').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
    }

    if (snap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete merge' }, { status: 500 });
  }
}
