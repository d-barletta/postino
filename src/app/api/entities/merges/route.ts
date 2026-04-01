import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { EntityCategory } from '@/types';

const VALID_CATEGORIES: EntityCategory[] = [
  'topics',
  'people',
  'organizations',
  'places',
  'events',
  'tags',
];

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
      .collection('entityMerges')
      .where('userId', '==', decoded.uid)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const merges = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ merges });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUser(request);
    const body = await request.json() as Record<string, unknown>;
    const { category, canonical, aliases } = body;

    if (!category || !VALID_CATEGORIES.includes(category as EntityCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (
      !canonical ||
      typeof canonical !== 'string' ||
      !canonical.trim()
    ) {
      return NextResponse.json({ error: 'Canonical name is required' }, { status: 400 });
    }

    if (
      !Array.isArray(aliases) ||
      aliases.length < 2 ||
      aliases.some((a) => typeof a !== 'string' || !a.trim())
    ) {
      return NextResponse.json(
        { error: 'At least two non-empty aliases are required' },
        { status: 400 },
      );
    }

    const trimmedCanonical = (canonical as string).trim();
    const trimmedAliases: string[] = (aliases as string[]).map((a) => a.trim());

    const db = adminDb();

    // Check for overlapping aliases in existing merges for this category
    const existingSnap = await db
      .collection('entityMerges')
      .where('userId', '==', decoded.uid)
      .where('category', '==', category)
      .limit(500)
      .get();

    for (const doc of existingSnap.docs) {
      const existingAliases = doc.data().aliases as string[];
      const overlap = trimmedAliases.some((a) => existingAliases.includes(a));
      if (overlap) {
        return NextResponse.json(
          { error: 'One or more aliases already belong to another merge in this category', existingId: doc.id },
          { status: 409 },
        );
      }
    }

    const ref = await db.collection('entityMerges').add({
      userId: decoded.uid,
      category,
      canonical: trimmedCanonical,
      aliases: trimmedAliases,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to create merge' }, { status: 500 });
  }
}
