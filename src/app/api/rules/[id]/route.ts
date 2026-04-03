import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

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

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
    }

    if (isActive === true && !ruleSnap.data()?.isActive) {
      const settingsSnap = await db.collection('settings').doc('global').get();
      const maxActiveRules = settingsSnap.data()?.maxActiveRules ?? 3;
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      const isUserAdmin = !!userSnap.data()?.isAdmin;

      if (!isUserAdmin) {
        const activeRulesSnap = await db
          .collection('rules')
          .where('userId', '==', decoded.uid)
          .where('isActive', '==', true)
          .get();

        if (activeRulesSnap.size >= maxActiveRules) {
          return NextResponse.json(
            { error: `You have reached the maximum of ${maxActiveRules} active rules` },
            { status: 400 }
          );
        }
      }
    }

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
      }

      if (name.trim().length > MAX_RULE_NAME_LENGTH) {
        return NextResponse.json({ error: `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters` }, { status: 400 });
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

    if (text !== undefined) {
      if (typeof text !== 'string' || !text.trim()) {
        return NextResponse.json({ error: 'Rule text must be a non-empty string' }, { status: 400 });
      }

      const settingsSnap = await db.collection('settings').doc('global').get();
      const maxRuleLength = settingsSnap.data()?.maxRuleLength ?? 1000;
      if (text.length > maxRuleLength) {
        return NextResponse.json({ error: `Rule exceeds maximum length of ${maxRuleLength}` }, { status: 400 });
      }
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

    const updateData: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (isActive !== undefined) updateData.isActive = isActive;
    if (text !== undefined) updateData.text = text.trim();
    if (name !== undefined) updateData.name = name.trim();
    if (matchSender !== undefined) updateData.matchSender = matchSender?.trim() || '';
    if (matchSubject !== undefined) updateData.matchSubject = matchSubject?.trim() || '';
    if (matchBody !== undefined) updateData.matchBody = matchBody?.trim() || '';

    await ruleRef.update(updateData);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[rules/[id]] PATCH error:', err);
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
  } catch (err) {
    console.error('[rules/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
