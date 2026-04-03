import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  return adminAuth().verifyIdToken(token);
}

// ---------------------------------------------------------------------------
// PATCH – accept or reject a suggestion
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let decoded: Awaited<ReturnType<typeof verifyUser>>;
  try {
    decoded = await verifyUser(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const { status } = body;

    if (status !== 'accepted' && status !== 'rejected') {
      return NextResponse.json(
        { error: 'Status must be "accepted" or "rejected"' },
        { status: 400 },
      );
    }

    const db = adminDb();
    const docRef = db.collection('entityMergeSuggestions').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    if (snap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.update({ status });

    return NextResponse.json({ id, status });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/merge-suggestions/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update suggestion' }, { status: 500 });
  }
}
