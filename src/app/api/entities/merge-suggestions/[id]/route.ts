import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// PATCH – accept or reject a suggestion
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let uid: string;
  try {
    const decoded = await verifyUserRequest(request);
    uid = decoded.uid;
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

    if (snap.data()?.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.update({ status });

    return NextResponse.json({ id, status });
  } catch (err) {
    return handleUserError(err, 'entities/merge-suggestions/[id] PATCH');
  }
}
