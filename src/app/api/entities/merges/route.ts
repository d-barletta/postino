import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { EntityCategory } from '@/types';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

const VALID_CATEGORIES: EntityCategory[] = [
  'topics',
  'people',
  'organizations',
  'places',
  'events',
  'tags',
];

export async function GET(request: NextRequest) {
  let uid: string;
  try {
    const decoded = await verifyUserRequest(request);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = adminDb();
    const snap = await db
      .collection('entityMerges')
      .where('userId', '==', uid)
      .orderBy('canonical', 'asc')
      .limit(500)
      .get();

    const merges = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ merges });
  } catch (err) {
    console.error('[entities/merges] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch merges' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
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
    const rawAliases: string[] = (aliases as string[]).map((a) => a.trim());

    // Deduplicate aliases case-insensitively, preserving first occurrence
    const seenLower = new Set<string>();
    const trimmedAliases: string[] = [];
    for (const a of rawAliases) {
      const lc = a.toLowerCase();
      if (!seenLower.has(lc)) {
        seenLower.add(lc);
        trimmedAliases.push(a);
      }
    }

    if (trimmedAliases.length < 2) {
      return NextResponse.json(
        { error: 'At least two non-empty aliases are required' },
        { status: 400 },
      );
    }

    const db = adminDb();

    // Find all existing merges in this category that overlap with the incoming aliases
    const existingSnap = await db
      .collection('entityMerges')
      .where('userId', '==', decoded.uid)
      .where('category', '==', category)
      .limit(500)
      .get();

    const overlappingDocs = existingSnap.docs.filter((doc) => {
      const existingAliases = doc.data().aliases as string[];
      return trimmedAliases.some((a) =>
        existingAliases.some((ea) => ea.toLowerCase() === a.toLowerCase()),
      );
    });

    if (overlappingDocs.length > 0) {
      // Combine aliases from all overlapping merges + the new aliases, deduplicating case-insensitively
      const unifiedSeenLower = new Set<string>();
      const unifiedAliases: string[] = [];
      for (const a of [
        ...trimmedAliases,
        ...overlappingDocs.flatMap((doc) => doc.data().aliases as string[]),
      ]) {
        const lc = a.toLowerCase();
        if (!unifiedSeenLower.has(lc)) {
          unifiedSeenLower.add(lc);
          unifiedAliases.push(a);
        }
      }

      // Keep the first overlapping merge as the base; delete the rest
      const [baseDoc, ...docsToDelete] = overlappingDocs;
      const batch = db.batch();
      batch.update(baseDoc.ref, {
        canonical: trimmedCanonical,
        aliases: unifiedAliases,
      });
      for (const doc of docsToDelete) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      return NextResponse.json({ id: baseDoc.id }, { status: 200 });
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
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/merges] POST error:', err);
    return NextResponse.json({ error: 'Failed to create merge' }, { status: 500 });
  }
}
