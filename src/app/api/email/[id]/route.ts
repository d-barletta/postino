import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await verifyUserRequest(request);

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
    if (isFirebaseAuthError(error) || (error instanceof Error && error.message === 'Forbidden')) {
      const status = error instanceof Error && error.message === 'Forbidden' ? 403 : 401;
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unauthorized' }, { status });
    }
    console.error('Error deleting email:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
