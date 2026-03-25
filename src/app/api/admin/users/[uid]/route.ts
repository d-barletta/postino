import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await verifyAdmin(request);
    const updates = await request.json();
    const { uid } = await params;
    const db = adminDb();

    const allowed = ['isAdmin', 'isActive'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
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
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await verifyAdmin(request);
    const { uid } = await params;
    const db = adminDb();

    const targetSnap = await db.collection('users').doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetSnap.data()?.isAdmin) {
      return NextResponse.json({ error: 'Cannot delete an admin user' }, { status: 400 });
    }

    // Gather all documents to delete in a single batch
    const [rulesSnap, logsSnap] = await Promise.all([
      db.collection('rules').where('userId', '==', uid).get(),
      db.collection('emailLogs').where('userId', '==', uid).get(),
    ]);

    const batch = db.batch();
    rulesSnap.docs.forEach((d) => batch.delete(d.ref));
    logsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection('userMemory').doc(uid));
    batch.delete(db.collection('users').doc(uid));
    await batch.commit();

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
    return NextResponse.json({ error: msg }, { status });
  }
}
