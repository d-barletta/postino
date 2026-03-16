import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  return adminAuth().verifyIdToken(token);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUser(request);
    const { id } = await params;
    const db = adminDb();
    const ruleRef = db.collection('rules').doc(id);
    const ruleSnap = await ruleRef.get();

    if (!ruleSnap.exists || ruleSnap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { text, isActive } = await request.json();
    await ruleRef.update({ text, isActive, updatedAt: Timestamp.now() });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUser(request);
    const { id } = await params;
    const db = adminDb();
    const ruleRef = db.collection('rules').doc(id);
    const ruleSnap = await ruleRef.get();

    if (!ruleSnap.exists || ruleSnap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await ruleRef.delete();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
