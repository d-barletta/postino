import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';
import type {
  EntityGraphNode,
  EntityGraphEdge,
  EntityRelationGraph,
  EntityGraphNodeCategory,
} from '@/types';

/** Maximum number of email logs fetched for analysis (matches knowledge route). */
const FETCH_LIMIT = 1000;
/** Maximum number of entity merges fetched per user. */
const MERGES_LIMIT = 500;
/** Maximum entities kept per category when building the graph nodes. */
const TOP_K = 15;
/** Minimum co-occurrence weight for an edge to be included (≥1 shared email). */
const MIN_EDGE_WEIGHT = 1;

/** All entity graph node categories in a fixed order for consistent processing. */
const ALL_CATEGORIES: EntityGraphNodeCategory[] = [
  'topics',
  'tags',
  'people',
  'organizations',
  'places',
  'events',
];

interface CountMap {
  [value: string]: number;
}

function applyMerges(map: CountMap, merges: Array<{ canonical: string; aliases: string[] }>): void {
  for (const merge of merges) {
    let total = 0;
    for (const alias of merge.aliases) {
      if (alias in map) {
        total += map[alias];
        delete map[alias];
      }
    }
    if (total > 0) {
      map[merge.canonical] = (map[merge.canonical] ?? 0) + total;
    }
  }
}

/** Build an alias → canonical lookup map (case-insensitive key). */
function buildAliasToCanonical(
  merges: Array<{ canonical: string; aliases: string[] }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const merge of merges) {
    for (const alias of merge.aliases) {
      m.set(alias.toLowerCase(), merge.canonical);
    }
  }
  return m;
}

function toTopK(map: CountMap, k: number): Array<{ value: string; count: number }> {
  return Object.entries(map)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, k);
}

function collectNormalized(
  rawValues: unknown,
  aliasMap: Map<string, string>,
  topSet: Set<string>,
): string[] {
  const result: string[] = [];
  if (!Array.isArray(rawValues)) return result;
  for (const v of rawValues) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const raw = v.trim();
    const canonical = aliasMap.get(raw.toLowerCase()) ?? raw;
    if (topSet.has(canonical)) result.push(canonical);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET – return cached relation graph
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    const doc = await db.collection('entityRelations').doc(decoded.uid).get();
    if (!doc.exists) {
      return NextResponse.json({ graph: null });
    }

    const data = doc.data();
    return NextResponse.json({
      graph: {
        nodes: data?.nodes ?? [],
        edges: data?.edges ?? [],
        generatedAt: data?.generatedAt ?? null,
        totalEmails: data?.totalEmails ?? 0,
      } satisfies EntityRelationGraph,
    });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/relations] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch relation graph' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST – compute and store a fresh relation graph
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
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

    // Build merges by category
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

    // -------------------------------------------------------------------
    // Pass 1: build frequency maps and collect per-email entity lists
    // -------------------------------------------------------------------
    const freqs: Record<EntityGraphNodeCategory, CountMap> = {
      topics: {},
      tags: {},
      people: {},
      organizations: {},
      places: {},
      events: {},
    };

    type PerEmailEntities = Record<EntityGraphNodeCategory, string[]>;
    const perEmailRaw: PerEmailEntities[] = [];

    let totalEmails = 0;

    for (const doc of snap.docs) {
      const analysis = doc.data().emailAnalysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      totalEmails++;

      const raw: PerEmailEntities = {
        topics: [],
        tags: [],
        people: [],
        organizations: [],
        places: [],
        events: [],
      };

      const collectRaw = (cat: EntityGraphNodeCategory, values: unknown) => {
        if (!Array.isArray(values)) return;
        for (const v of values) {
          if (typeof v === 'string' && v.trim()) {
            const key = v.trim();
            freqs[cat][key] = (freqs[cat][key] ?? 0) + 1;
            raw[cat].push(key);
          }
        }
      };

      collectRaw('topics', analysis.topics);
      collectRaw('tags', analysis.tags);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        collectRaw('people', entities.people);
        collectRaw('organizations', entities.organizations);
        collectRaw('places', extractStoredPlaceNames(entities.places, entities.placeNames));
        collectRaw('events', entities.events);
      }

      perEmailRaw.push(raw);
    }

    // Apply merges to frequency maps
    for (const cat of ALL_CATEGORIES) {
      const catMerges = mergesByCategory[cat];
      if (catMerges) applyMerges(freqs[cat], catMerges);
    }

    // Build top-K sets and alias maps per category
    const topSets = Object.fromEntries(
      ALL_CATEGORIES.map((cat) => [cat, new Set(toTopK(freqs[cat], TOP_K).map((x) => x.value))]),
    ) as Record<EntityGraphNodeCategory, Set<string>>;

    const aliasMaps = Object.fromEntries(
      ALL_CATEGORIES.map((cat) => [cat, buildAliasToCanonical(mergesByCategory[cat] ?? [])]),
    ) as Record<EntityGraphNodeCategory, Map<string, string>>;

    // -------------------------------------------------------------------
    // Build nodes
    // -------------------------------------------------------------------
    const nodes: EntityGraphNode[] = [];
    let nodeIdx = 0;
    const labelToId = new Map<string, string>(); // key = "category:label"

    for (const cat of ALL_CATEGORIES) {
      for (const { value, count } of toTopK(freqs[cat], TOP_K)) {
        const id = `n${nodeIdx++}`;
        nodes.push({ id, label: value, category: cat, count });
        labelToId.set(`${cat}:${value}`, id);
      }
    }

    // -------------------------------------------------------------------
    // Pass 2: compute co-occurrence edges
    // -------------------------------------------------------------------
    const edgeWeights = new Map<string, number>(); // key = "idA~idB" (sorted)

    for (const raw of perEmailRaw) {
      // Collect all node IDs present in this email
      const presentIds: string[] = [];

      for (const cat of ALL_CATEGORIES) {
        const normalized = collectNormalized(raw[cat], aliasMaps[cat], topSets[cat]);
        for (const label of normalized) {
          const id = labelToId.get(`${cat}:${label}`);
          if (id && !presentIds.includes(id)) presentIds.push(id);
        }
      }

      // Increment weight for every pair
      for (let i = 0; i < presentIds.length; i++) {
        for (let j = i + 1; j < presentIds.length; j++) {
          const a = presentIds[i];
          const b = presentIds[j];
          const key = a < b ? `${a}~${b}` : `${b}~${a}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
      }
    }

    // Build edges array (filter weak connections)
    const edges: EntityGraphEdge[] = [];
    let edgeIdx = 0;
    for (const [key, weight] of edgeWeights) {
      if (weight < MIN_EDGE_WEIGHT) continue;
      const [source, target] = key.split('~');
      edges.push({ id: `e${edgeIdx++}`, source, target, weight });
    }

    const generatedAt = new Date().toISOString();
    const graph: EntityRelationGraph = { nodes, edges, generatedAt, totalEmails };

    // Persist to Firestore (merge: true to overwrite)
    await db
      .collection('entityRelations')
      .doc(decoded.uid)
      .set({
        ...graph,
        userId: decoded.uid,
        updatedAt: new Date(),
      });

    return NextResponse.json({ graph });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/relations] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate relation graph' }, { status: 500 });
  }
}
