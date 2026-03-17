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

    const { name, text, isActive, matchSender, matchSubject, matchBody } = await request.json();

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
      }

      // Check name uniqueness (exclude current rule)
      const existingSnap = await db
        .collection('rules')
        .where('userId', '==', decoded.uid)
        .where('name', '==', name.trim())
        .limit(1)
        .get();

      if (!existingSnap.empty && existingSnap.docs[0].id !== id) {
        return NextResponse.json({ error: 'A rule with this name already exists' }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = { isActive, updatedAt: Timestamp.now() };
    if (text !== undefined) updateData.text = text;
    if (name !== undefined) updateData.name = name.trim();
    if (matchSender !== undefined) updateData.matchSender = matchSender?.trim() || '';
    if (matchSubject !== undefined) updateData.matchSubject = matchSubject?.trim() || '';
    if (matchBody !== undefined) updateData.matchBody = matchBody?.trim() || '';

    await ruleRef.update(updateData);
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
