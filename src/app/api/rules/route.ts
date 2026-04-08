import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const snap = await db.collection('rules').where('userId', '==', decoded.uid).get();

    // Sort rules by sortOrder ASC (user-defined), then by createdAt ASC as tiebreaker.
    // This keeps the display order consistent with processing order.
    const rules = snap.docs
      .sort((a, b) => {
        const aOrder =
          typeof a.data().sortOrder === 'number'
            ? (a.data().sortOrder as number)
            : Number.MAX_SAFE_INTEGER;
        const bOrder =
          typeof b.data().sortOrder === 'number'
            ? (b.data().sortOrder as number)
            : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0);
      })
      .map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() ?? null,
      }));

    return NextResponse.json({ rules });
  } catch (err) {
    if (err instanceof Error && (err.message === 'Unauthorized' || isFirebaseAuthError(err))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[rules] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }
}

const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const { name, text, matchSender, matchSubject, matchBody } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    }

    if (name.trim().length > MAX_RULE_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Rule text is required' }, { status: 400 });
    }

    if (
      matchSender !== undefined &&
      (typeof matchSender !== 'string' || matchSender.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Sender pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (
      matchSubject !== undefined &&
      (typeof matchSubject !== 'string' || matchSubject.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Subject pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (
      matchBody !== undefined &&
      (typeof matchBody !== 'string' || matchBody.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Body pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }

    const db = adminDb();

    // Fetch name-uniqueness check, settings and user doc in parallel.
    const [existingSnap, settingsSnap, userSnap] = await Promise.all([
      db
        .collection('rules')
        .where('userId', '==', decoded.uid)
        .where('name', '==', name.trim())
        .limit(1)
        .get(),
      db.collection('settings').doc('global').get(),
      db.collection('users').doc(decoded.uid).get(),
    ]);

    if (!existingSnap.empty) {
      return NextResponse.json({ error: 'A rule with this name already exists' }, { status: 409 });
    }

    const maxRuleLength = settingsSnap.data()?.maxRuleLength ?? 1000;

    if (text.length > maxRuleLength) {
      return NextResponse.json(
        { error: `Rule exceeds maximum length of ${maxRuleLength}` },
        { status: 400 },
      );
    }

    const maxActiveRules = settingsSnap.data()?.maxActiveRules ?? 3;
    const isAdmin = !!userSnap.data()?.isAdmin;

    if (!isAdmin) {
      const activeRulesSnap = await db
        .collection('rules')
        .where('userId', '==', decoded.uid)
        .where('isActive', '==', true)
        .get();

      if (activeRulesSnap.size >= maxActiveRules) {
        return NextResponse.json(
          { error: `You have reached the maximum of ${maxActiveRules} active rules` },
          { status: 400 },
        );
      }
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
    if (isFirebaseAuthError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create rule error:', error);
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}
