import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// DELETE – remove all entity-related data for the authenticated user:
//   • entityMerges        – user-defined entity merge rules
//   • entityMergeSuggestions – AI-generated merge suggestions
//   • entityRelations/{uid} – cached relation graph
//   • entityFlows/{uid}   – cached flow graph
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const uid = decoded.uid;

    // Fetch all entityMerges and entityMergeSuggestions for this user
    const [mergesSnap, suggestionsSnap] = await Promise.all([
      db.collection('entityMerges').where('userId', '==', uid).get(),
      db.collection('entityMergeSuggestions').where('userId', '==', uid).get(),
    ]);

    // Firestore batch supports up to 500 operations; chunk if needed
    const deleteRefs = [
      ...mergesSnap.docs.map((d) => d.ref),
      ...suggestionsSnap.docs.map((d) => d.ref),
    ];

    // Delete in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < deleteRefs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const ref of deleteRefs.slice(i, i + BATCH_SIZE)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    // Delete cached graphs (single documents keyed by userId)
    await Promise.all([
      db.collection('entityRelations').doc(uid).delete(),
      db.collection('entityFlows').doc(uid).delete(),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/all] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete entity data' }, { status: 500 });
  }
}
