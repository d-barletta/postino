import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';

const FETCH_LIMIT = 1000;
const MERGES_LIMIT = 500;
const TOP_N = 50;

interface CountMap {
  [value: string]: number;
}

function toSortedArray(map: CountMap): { value: string; count: number }[] {
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

function increment(map: CountMap, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    const key = value.trim().toLowerCase();
    map[key] = (map[key] ?? 0) + 1;
  }
}

function incrementAll(map: CountMap, values: unknown): void {
  if (Array.isArray(values)) {
    for (const v of values) increment(map, v);
  }
}

/** Apply entity merges to a CountMap in-place.
 *  For each merge, sum all alias counts into the canonical key and delete the aliases. */
function applyMerges(map: CountMap, merges: Array<{ canonical: string; aliases: string[] }>): void {
  for (const merge of merges) {
    let total = 0;
    for (const alias of merge.aliases) {
      const key = alias.toLowerCase();
      if (key in map) {
        total += map[key];
        delete map[key];
      }
    }
    if (total > 0) {
      map[merge.canonical] = (map[merge.canonical] ?? 0) + total;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

    const db = adminDb();

    // Fetch email logs and entity merges in parallel
    const [snap, mergesSnap] = await Promise.all([
      db
        .collection('emailLogs')
        .where('userId', '==', decoded.uid)
        .orderBy('receivedAt', 'desc')
        .limit(FETCH_LIMIT)
        .get(),
      db.collection('entityMerges').where('userId', '==', decoded.uid).limit(MERGES_LIMIT).get(),
    ]);

    // Group merges by category
    const mergesByCategory: Record<string, Array<{ canonical: string; aliases: string[] }>> = {};
    for (const doc of mergesSnap.docs) {
      const d = doc.data();
      const cat = d.category as string;
      if (!mergesByCategory[cat]) mergesByCategory[cat] = [];
      mergesByCategory[cat].push({
        canonical: d.canonical as string,
        aliases: d.aliases as string[],
      });
    }

    const topics: CountMap = {};
    const tags: CountMap = {};
    const people: CountMap = {};
    const organizations: CountMap = {};
    const places: CountMap = {};
    const events: CountMap = {};
    const languages: CountMap = {};

    let totalEmails = 0;

    for (const doc of snap.docs) {
      const analysis = doc.data().emailAnalysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      totalEmails++;
      incrementAll(topics, analysis.topics);
      incrementAll(tags, analysis.tags);
      increment(languages, analysis.language);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        incrementAll(people, entities.people);
        incrementAll(organizations, entities.organizations);
        incrementAll(places, extractStoredPlaceNames(entities.places, entities.placeNames));
        incrementAll(events, entities.events);
      }
    }

    // Apply user-defined merges
    if (mergesByCategory.topics) applyMerges(topics, mergesByCategory.topics);
    if (mergesByCategory.tags) applyMerges(tags, mergesByCategory.tags);
    if (mergesByCategory.people) applyMerges(people, mergesByCategory.people);
    if (mergesByCategory.organizations) applyMerges(organizations, mergesByCategory.organizations);
    if (mergesByCategory.places) applyMerges(places, mergesByCategory.places);
    if (mergesByCategory.events) applyMerges(events, mergesByCategory.events);

    return NextResponse.json({
      topics: toSortedArray(topics),
      tags: toSortedArray(tags),
      people: toSortedArray(people),
      organizations: toSortedArray(organizations),
      places: toSortedArray(places),
      events: toSortedArray(events),
      languages: toSortedArray(languages),
      totalEmails,
    });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[email/knowledge] error:', err);
    return NextResponse.json({ error: 'Failed to fetch knowledge data' }, { status: 500 });
  }
}
