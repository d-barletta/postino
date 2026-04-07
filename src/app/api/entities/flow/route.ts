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
/** Minimum continuity weight for a temporal edge to be included. */
const MIN_EDGE_WEIGHT = 1;
/** Maximum number of monthly buckets with data to include. */
const NUM_BUCKETS = 8;
/** Bump when the stored flow graph shape or semantics change. */
const FLOW_GRAPH_VERSION = 2;

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

type AnalyzedEmail = {
  receivedAt: Date;
  analysis: Record<string, unknown>;
};

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

function getMonthBucketStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getDateOrNull(value: unknown): Date | null {
  if (!value) return null;

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortCountEntries(map: CountMap): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
    if (data?.version !== FLOW_GRAPH_VERSION) {
      return NextResponse.json({ graph: null });
    }

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
    // Build time buckets from actual email months with data.
    // -----------------------------------------------------------------------
    const analyzedEmails: AnalyzedEmail[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const analysis = data.emailAnalysis as Record<string, unknown> | undefined;
      const receivedAt = getDateOrNull(data.receivedAt);
      if (!analysis || !receivedAt) continue;

      analyzedEmails.push({ receivedAt, analysis });
    }

    const bucketStartDates = Array.from(
      new Set(analyzedEmails.map(({ receivedAt }) => getMonthBucketStart(receivedAt).toISOString())),
    )
      .map((iso) => new Date(iso))
      .sort((a, b) => b.getTime() - a.getTime())
      .slice(0, NUM_BUCKETS)
      .sort((a, b) => a.getTime() - b.getTime());

    const bucketIndexByStartDate = new Map(
      bucketStartDates.map((date, index) => [date.toISOString(), index]),
    );

    const bucketLabels: FlowGraphBucket[] = bucketStartDates.map((d, i) => ({
      index: i,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      startDate: d.toISOString(),
    }));

    // -----------------------------------------------------------------------
    // Pass 1: assign each email to a bucket and collect entity occurrences
    // -----------------------------------------------------------------------
    // freqs[bucketIdx][cat][entity] = count
    const bucketFreqs: Array<Record<EntityGraphNodeCategory, CountMap>> = Array.from(
      { length: bucketLabels.length },
      () =>
        Object.fromEntries(
          ALL_CATEGORIES.map((cat) => [cat, {}]),
        ) as Record<EntityGraphNodeCategory, CountMap>,
    );

    let totalEmails = 0;

    for (const { receivedAt, analysis } of analyzedEmails) {
      const bucketIdx = bucketIndexByStartDate.get(getMonthBucketStart(receivedAt).toISOString());
      if (bucketIdx === undefined) continue;

      totalEmails++;

      const collectRaw = (cat: EntityGraphNodeCategory, values: unknown) => {
        if (!Array.isArray(values)) return;
        const seenInEmail = new Set<string>();

        for (const v of values) {
          if (typeof v === 'string' && v.trim()) {
            const key = v.trim();
            const aliasMap = aliasMaps[cat];
            const canonical = aliasMap.get(key.toLowerCase()) ?? key;
            if (seenInEmail.has(canonical)) continue;

            seenInEmail.add(canonical);
            bucketFreqs[bucketIdx][cat][canonical] =
              (bucketFreqs[bucketIdx][cat][canonical] ?? 0) + 1;
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
    }

    // Apply merges to bucket frequency maps
    for (let bi = 0; bi < bucketLabels.length; bi++) {
      for (const cat of ALL_CATEGORIES) {
        const catMerges = mergesByCategory[cat];
        if (catMerges) applyMerges(bucketFreqs[bi][cat], catMerges);
      }
    }

    // -----------------------------------------------------------------------
    // Build nodes: keep top-K entities per category for every displayed bucket.
    // -----------------------------------------------------------------------
    const nodes: FlowGraphNode[] = [];
    let nodeIdx = 0;
    const nodesByEntity = new Map<string, FlowGraphNode[]>();

    for (let bi = 0; bi < bucketLabels.length; bi++) {
      for (const cat of ALL_CATEGORIES) {
        const topEntities = sortCountEntries(bucketFreqs[bi][cat]).slice(0, TOP_K_PER_BUCKET);

        for (const [label, count] of topEntities) {
          const node: FlowGraphNode = {
            id: `n${nodeIdx++}`,
            label,
            category: cat,
            count,
            bucketIndex: bi,
            bucketLabel: bucketLabels[bi].label,
          };

          nodes.push(node);

          const entityKey = `${cat}:${label}`;
          const entityNodes = nodesByEntity.get(entityKey) ?? [];
          entityNodes.push(node);
          nodesByEntity.set(entityKey, entityNodes);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Build temporal continuity edges between the same entity across buckets.
    // -----------------------------------------------------------------------
    const edges: EntityGraphEdge[] = [];
    let edgeIdx = 0;

    for (const entityNodes of nodesByEntity.values()) {
      entityNodes.sort((a, b) => a.bucketIndex - b.bucketIndex);

      for (let i = 1; i < entityNodes.length; i++) {
        const previousNode = entityNodes[i - 1];
        const currentNode = entityNodes[i];
        const weight = Math.max(1, Math.min(previousNode.count, currentNode.count));
        if (weight < MIN_EDGE_WEIGHT) continue;

        edges.push({
          id: `e${edgeIdx++}`,
          source: previousNode.id,
          target: currentNode.id,
          weight,
        });
      }
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
      .set({ ...graph, version: FLOW_GRAPH_VERSION, userId: decoded.uid, updatedAt: new Date() });

    return NextResponse.json({ graph });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/flow] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate flow graph' }, { status: 500 });
  }
}
