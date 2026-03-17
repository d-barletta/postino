import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  return adminAuth().verifyIdToken(token);
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUser(request);
    const db = adminDb();
    const snap = await db
      .collection('rules')
      .where('userId', '==', decoded.uid)
      .orderBy('createdAt', 'desc')
      .get();

    const rules = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUser(request);
    const { name, text, matchSender, matchSubject, matchBody } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    }

    if (name.trim().length > MAX_RULE_NAME_LENGTH) {
      return NextResponse.json({ error: `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters` }, { status: 400 });
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Rule text is required' }, { status: 400 });
    }

    if (matchSender !== undefined && (typeof matchSender !== 'string' || matchSender.length > MAX_PATTERN_LENGTH)) {
      return NextResponse.json({ error: `Sender pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` }, { status: 400 });
    }

    if (matchSubject !== undefined && (typeof matchSubject !== 'string' || matchSubject.length > MAX_PATTERN_LENGTH)) {
      return NextResponse.json({ error: `Subject pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` }, { status: 400 });
    }

    if (matchBody !== undefined && (typeof matchBody !== 'string' || matchBody.length > MAX_PATTERN_LENGTH)) {
      return NextResponse.json({ error: `Body pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` }, { status: 400 });
    }

    const db = adminDb();

    // Check name uniqueness for this user
    const existingSnap = await db
      .collection('rules')
      .where('userId', '==', decoded.uid)
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return NextResponse.json({ error: 'A rule with this name already exists' }, { status: 409 });
    }

    const settingsSnap = await db.collection('settings').doc('global').get();
    const maxRuleLength = settingsSnap.data()?.maxRuleLength ?? 1000;

    if (text.length > maxRuleLength) {
      return NextResponse.json({ error: `Rule exceeds maximum length of ${maxRuleLength}` }, { status: 400 });
    }

    const now = Timestamp.now();
    const ref = await db.collection('rules').add({
      userId: decoded.uid,
      name: name.trim(),
      text: text.trim(),
      matchSender: matchSender?.trim() || '',
      matchSubject: matchSubject?.trim() || '',
      matchBody: matchBody?.trim() || '',
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error('Create rule error:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}
