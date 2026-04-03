import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { verifyAdminRequest } from '@/lib/api-auth';

/** Maximum write operations per Firestore batch (hard limit is 500). */
const BATCH_SIZE = 400;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const updates = await request.json();
    const { uid } = await params;
    const db = adminDb();

    const allowed = ['isAdmin', 'isActive'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k)),
    );

    if ('isActive' in filtered) {
      const targetSnap = await db.collection('users').doc(uid).get();
      if (targetSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Cannot suspend an admin user' }, { status: 400 });
      }
      filtered.suspended = !filtered.isActive;
    }

    await db.collection('users').doc(uid).update(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users/[uid]] PATCH error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const db = adminDb();

    const targetSnap = await db.collection('users').doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetSnap.data()?.isAdmin) {
      return NextResponse.json({ error: 'Cannot delete an admin user' }, { status: 400 });
    }

    // Gather all documents to delete
    const [rulesSnap, logsSnap, entityMergesSnap, entityMergeSuggestionsSnap] = await Promise.all([
      db.collection('rules').where('userId', '==', uid).get(),
      db.collection('emailLogs').where('userId', '==', uid).get(),
      db.collection('entityMerges').where('userId', '==', uid).get(),
      db.collection('entityMergeSuggestions').where('userId', '==', uid).get(),
    ]);

    // Collect all refs to delete (rules + logs + entity data + auxiliary docs)
    const refsToDelete = [
      ...rulesSnap.docs.map((d) => d.ref),
      ...logsSnap.docs.map((d) => d.ref),
      ...entityMergesSnap.docs.map((d) => d.ref),
      ...entityMergeSuggestionsSnap.docs.map((d) => d.ref),
      db.collection('entityRelations').doc(uid),
      db.collection('userMemory').doc(uid),
      db.collection('users').doc(uid),
    ];

    // Delete in BATCH_SIZE chunks to stay within Firestore's per-batch limit.
    for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = refsToDelete.slice(i, i + BATCH_SIZE);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    // Delete Firebase Auth user
    try {
      await adminAuth().deleteUser(uid);
    } catch (authError) {
      const code = (authError as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        console.error(`Failed to delete Firebase Auth user ${uid}:`, authError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users/[uid]] DELETE error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
