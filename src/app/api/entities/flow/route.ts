import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';
import type {
  EntityGraphEdge,
  EntityFlowGraph,
  EntityGraphNodeCategory,
  FlowGraphNode,
  FlowGraphBucket,
} from '@/types';

/** Maximum number of email logs fetched per build. */
const FETCH_LIMIT = 500;
/** Maximum entity merges fetched per user. */
const MERGES_LIMIT = 500;
/** Max entities kept per category per time bucket. */
const TOP_K_PER_BUCKET = 5;
/** Minimum co-occurrence weight within a bucket for an edge to be included. */
const MIN_EDGE_WEIGHT = 1;
/** Number of monthly buckets to include (recent → past). */
const NUM_BUCKETS = 8;

const ALL_CATEGORIES: EntityGraphNodeCategory[] = [
  'people',
  'organizations',
  'events',
  'places',
  'topics',
  'tags',
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

/** Return the zero-indexed bucket number (0 = most recent) for a given date. */
function getBucketIndex(date: Date, bucketStartDates: Date[]): number {
  for (let i = 0; i < bucketStartDates.length; i++) {
    if (date >= bucketStartDates[i]) return i;
  }
  return bucketStartDates.length - 1;
}

// ---------------------------------------------------------------------------
// GET – return cached flow graph
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    const doc = await db.collection('entityFlows').doc(decoded.uid).get();
    if (!doc.exists) {
      return NextResponse.json({ graph: null });
    }

    const data = doc.data();
    return NextResponse.json({
      graph: {
        nodes: data?.nodes ?? [],
        edges: data?.edges ?? [],
        buckets: data?.buckets ?? [],
        generatedAt: data?.generatedAt ?? null,
        totalEmails: data?.totalEmails ?? 0,
      } satisfies EntityFlowGraph,
    });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/flow] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch flow graph' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST – compute and store a fresh date-based flow graph
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    // Fetch email logs and merges in parallel
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
      mergesByCategory[cat].push({ canonical: d.canonical as string, aliases: d.aliases as string[] });
    }

    // Build alias maps per category
    const aliasMaps = Object.fromEntries(
      ALL_CATEGORIES.map((cat) => [cat, buildAliasToCanonical(mergesByCategory[cat] ?? [])]),
    ) as Record<EntityGraphNodeCategory, Map<string, string>>;

    // -----------------------------------------------------------------------
    // Build time buckets: NUM_BUCKETS monthly windows from today going back
    // -----------------------------------------------------------------------
    const now = new Date();
    // Bucket start dates: index 0 = most recent month, index N-1 = oldest month
    const bucketStartDates: Date[] = [];
    for (let i = 0; i < NUM_BUCKETS; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bucketStartDates.push(d);
    }

    const bucketLabels: FlowGraphBucket[] = bucketStartDates.map((d, i) => ({
      index: i,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      startDate: d.toISOString(),
    }));

    // -----------------------------------------------------------------------
    // Pass 1: assign each email to a bucket and collect entity occurrences
    // -----------------------------------------------------------------------
    type PerEmailEntities = Record<EntityGraphNodeCategory, string[]>;

    // freqs[bucketIdx][cat][entity] = count
    const bucketFreqs: Array<Record<EntityGraphNodeCategory, CountMap>> = Array.from(
      { length: NUM_BUCKETS },
      () =>
        Object.fromEntries(
          ALL_CATEGORIES.map((cat) => [cat, {}]),
        ) as Record<EntityGraphNodeCategory, CountMap>,
    );

    const perEmailBucketEntities: Array<{ bucketIdx: number; entities: PerEmailEntities }> = [];
    let totalEmails = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const analysis = data.emailAnalysis as Record<string, unknown> | undefined;
      if (!analysis) continue;

      const receivedAt: Date =
        data.receivedAt?.toDate ? data.receivedAt.toDate() : new Date(data.receivedAt as string);

      const bucketIdx = getBucketIndex(receivedAt, bucketStartDates);
      if (bucketIdx >= NUM_BUCKETS) continue; // outside our window

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
            const aliasMap = aliasMaps[cat];
            const canonical = aliasMap.get(key.toLowerCase()) ?? key;
            bucketFreqs[bucketIdx][cat][canonical] =
              (bucketFreqs[bucketIdx][cat][canonical] ?? 0) + 1;
            raw[cat].push(canonical);
          }
        }
      };

      collectRaw('topics', analysis.topics);
      collectRaw('tags', analysis.tags);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        collectRaw('people', entities.people);
        collectRaw('organizations', entities.organizations);
        collectRaw('places', entities.places);
        collectRaw('events', entities.events);
      }

      perEmailBucketEntities.push({ bucketIdx, entities: raw });
    }

    // Apply merges to bucket frequency maps
    for (let bi = 0; bi < NUM_BUCKETS; bi++) {
      for (const cat of ALL_CATEGORIES) {
        const catMerges = mergesByCategory[cat];
        if (catMerges) applyMerges(bucketFreqs[bi][cat], catMerges);
      }
    }

    // -----------------------------------------------------------------------
    // Build nodes: top-K entities per category per bucket
    // Each entity gets the most-recent bucket it appeared in as its bucketIndex
    // -----------------------------------------------------------------------
    const nodes: FlowGraphNode[] = [];
    let nodeIdx = 0;

    // Track which (cat:label) has been assigned a node already (use most-recent bucket)
    const labelToId = new Map<string, string>(); // key = "cat:label"

    for (let bi = 0; bi < NUM_BUCKETS; bi++) {
      for (const cat of ALL_CATEGORIES) {
        const topEntities = Object.entries(bucketFreqs[bi][cat])
          .sort(([, a], [, b]) => b - a)
          .slice(0, TOP_K_PER_BUCKET);

        for (const [label, count] of topEntities) {
          const key = `${cat}:${label}`;
          if (!labelToId.has(key)) {
            const id = `n${nodeIdx++}`;
            labelToId.set(key, id);
            nodes.push({
              id,
              label,
              category: cat,
              count,
              bucketIndex: bi,
              bucketLabel: bucketLabels[bi].label,
            });
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Pass 2: compute co-occurrence edges (within same bucket)
    // -----------------------------------------------------------------------
    // Build a Map for O(1) node lookup by id
    const nodeById = new Map<string, FlowGraphNode>(nodes.map((n) => [n.id, n]));
    const edgeWeights = new Map<string, number>();

    for (const { bucketIdx, entities } of perEmailBucketEntities) {
      // Collect node IDs from this email (only nodes assigned to this or a later bucket)
      const presentIds: string[] = [];

      for (const cat of ALL_CATEGORIES) {
        for (const label of entities[cat]) {
          const key = `${cat}:${label}`;
          const id = labelToId.get(key);
          if (id) {
            // Check that this node's bucket is this one or later (i.e., node was active here)
            const node = nodeById.get(id);
            if (node && node.bucketIndex >= bucketIdx && !presentIds.includes(id)) {
              presentIds.push(id);
            }
          }
        }
      }

      for (let i = 0; i < presentIds.length; i++) {
        for (let j = i + 1; j < presentIds.length; j++) {
          const a = presentIds[i];
          const b = presentIds[j];
          const key = a < b ? `${a}~${b}` : `${b}~${a}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
        }
      }
    }

    const edges: EntityGraphEdge[] = [];
    let edgeIdx = 0;
    for (const [key, weight] of edgeWeights) {
      if (weight < MIN_EDGE_WEIGHT) continue;
      const [source, target] = key.split('~');
      edges.push({ id: `e${edgeIdx++}`, source, target, weight });
    }

    const generatedAt = new Date().toISOString();
    const graph: EntityFlowGraph = {
      nodes,
      edges,
      buckets: bucketLabels,
      generatedAt,
      totalEmails,
    };

    await db
      .collection('entityFlows')
      .doc(decoded.uid)
      .set({ ...graph, userId: decoded.uid, updatedAt: new Date() });

    return NextResponse.json({ graph });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/flow] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate flow graph' }, { status: 500 });
  }
}
