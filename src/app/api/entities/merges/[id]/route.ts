import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUser(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing merge ID' }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { category, canonical, aliases } = body;

    if (!category || !VALID_CATEGORIES.includes(category as EntityCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (!canonical || typeof canonical !== 'string' || !canonical.trim()) {
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
    const docRef = db.collection('entityMerges').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
    }

    if (snap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find all OTHER merges in this category that overlap with the incoming aliases
    const existingSnap = await db
      .collection('entityMerges')
      .where('userId', '==', decoded.uid)
      .where('category', '==', category)
      .limit(500)
      .get();

    const overlappingDocs = existingSnap.docs.filter((doc) => {
      if (doc.id === id) return false; // skip the merge being updated
      const existingAliases = doc.data().aliases as string[];
      return trimmedAliases.some((a) => existingAliases.includes(a));
    });

    if (overlappingDocs.length > 0) {
      // Combine aliases from all overlapping merges + the incoming aliases into one unified set
      const unifiedAliases = new Set([
        ...trimmedAliases,
        ...overlappingDocs.flatMap((doc) => doc.data().aliases as string[]),
      ]);

      const batch = db.batch();
      batch.update(docRef, {
        canonical: trimmedCanonical,
        aliases: Array.from(unifiedAliases),
      });
      for (const doc of overlappingDocs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      return NextResponse.json({ success: true });
    }

    await docRef.update({
      canonical: trimmedCanonical,
      aliases: trimmedAliases,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/merges/[id]] PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update merge' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await verifyUser(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing merge ID' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('entityMerges').doc(id);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
    }

    if (snap.data()?.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/merges/[id]] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete merge' }, { status: 500 });
  }
}
