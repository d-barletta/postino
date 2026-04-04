import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

const MAX_REORDER_IDS = 200;

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const body = await request.json();

    if (
      !Array.isArray(body.orderedIds) ||
      body.orderedIds.some((id: unknown) => typeof id !== 'string')
    ) {
      return NextResponse.json(
        { error: 'orderedIds must be an array of strings' },
        { status: 400 },
      );
    }

    const orderedIds: string[] = body.orderedIds;
    if (orderedIds.length > MAX_REORDER_IDS) {
      return NextResponse.json(
        { error: `orderedIds cannot exceed ${MAX_REORDER_IDS} items` },
        { status: 400 },
      );
    }

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return NextResponse.json({ error: 'orderedIds cannot contain duplicates' }, { status: 400 });
    }

    const db = adminDb();

    // Verify ownership of all provided rule IDs in one batch read.
    const ruleRefs = orderedIds.map((id) => db.collection('rules').doc(id));
    const ruleSnaps = await db.getAll(...ruleRefs);

    const batch = db.batch();
    let updated = 0;

    ruleSnaps.forEach((snap, index) => {
      if (!snap.exists) return;
      if (snap.data()?.userId !== decoded.uid) return;
      batch.update(snap.ref, { sortOrder: index });
      updated++;
    });

    await batch.commit();

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    if (isFirebaseAuthError(error) || (error instanceof Error && error.message === 'Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[rules/reorder] error:', error);
    return NextResponse.json({ error: 'Failed to reorder rules' }, { status: 500 });
  }
}
