import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';
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
/** Minimum relationship weight for a temporal edge to be included. */
const MIN_EDGE_WEIGHT = 1;
/** Maximum number of monthly buckets with data to include. */
const NUM_BUCKETS = 8;
/** Bump when the stored flow graph shape or semantics change. */
const FLOW_GRAPH_VERSION = 5;

const ALL_CATEGORIES: EntityGraphNodeCategory[] = [
  'people',
  'organizations',
  'events',
  'dates',
  'places',
  'topics',
  'numbers',
  'prices',
];

interface CountMap {
  [value: string]: number;
}

type AnalyzedEmail = {
  receivedAt: Date;
  analysis: Record<string, unknown>;
};

type PerEmailEntities = Record<EntityGraphNodeCategory, string[]>;

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
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

    const { data: row } = await supabase
      .from('entity_flows')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .single();

    if (!row) {
      return NextResponse.json({ graph: null });
    }

    const data = row.data as (Record<string, unknown> & { version?: number }) | null;
    if (!data || data.version !== FLOW_GRAPH_VERSION) {
      return NextResponse.json({ graph: null });
    }

    return NextResponse.json({
      graph: {
        nodes: (data.nodes ?? []) as import('@/types').FlowGraphNode[],
        edges: (data.edges ?? []) as import('@/types').EntityGraphEdge[],
        buckets: (data.buckets ?? []) as import('@/types').FlowGraphBucket[],
        generatedAt: (data.generatedAt ?? '') as string,
        totalEmails: (data.totalEmails ?? 0) as number,
      } satisfies EntityFlowGraph,
    });
  } catch (err) {
    return handleUserError(err, 'entities/flow GET');
  }
}

// ---------------------------------------------------------------------------
// POST – compute and store a fresh date-based flow graph
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

    // Fetch email logs and merges in parallel
    const [logsResult, mergesResult] = await Promise.all([
      supabase
        .from('email_logs')
        .select('email_analysis, received_at')
        .eq('user_id', user.id)
        .not('email_analysis', 'is', null)
        .order('received_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('entity_merges')
        .select('category, canonical, aliases')
        .eq('user_id', user.id)
        .limit(MERGES_LIMIT),
    ]);

    // Build merges by category
    const mergesByCategory: Record<string, Array<{ canonical: string; aliases: string[] }>> = {};
    for (const row of mergesResult.data ?? []) {
      const cat = row.category as string;
      if (!mergesByCategory[cat]) mergesByCategory[cat] = [];
      mergesByCategory[cat].push({
        canonical: row.canonical as string,
        aliases: row.aliases as string[],
      });
    }

    // Build alias maps per category
    const aliasMaps = Object.fromEntries(
      ALL_CATEGORIES.map((cat) => [cat, buildAliasToCanonical(mergesByCategory[cat] ?? [])]),
    ) as Record<EntityGraphNodeCategory, Map<string, string>>;

    // -----------------------------------------------------------------------
    // Build time buckets from actual email months with data.
    // -----------------------------------------------------------------------
    const analyzedEmails: AnalyzedEmail[] = [];

    for (const row of logsResult.data ?? []) {
      const analysis = row.email_analysis as Record<string, unknown> | undefined;
      const receivedAt = getDateOrNull(row.received_at);
      if (!analysis || !receivedAt) continue;

      analyzedEmails.push({ receivedAt, analysis });
    }

    const bucketStartDates = Array.from(
      new Set(
        analyzedEmails.map(({ receivedAt }) => getMonthBucketStart(receivedAt).toISOString()),
      ),
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
        Object.fromEntries(ALL_CATEGORIES.map((cat) => [cat, {}])) as Record<
          EntityGraphNodeCategory,
          CountMap
        >,
    );
    const perEmailBucketEntities: Array<{ bucketIdx: number; entities: PerEmailEntities }> = [];

    let totalEmails = 0;

    for (const { receivedAt, analysis } of analyzedEmails) {
      const bucketIdx = bucketIndexByStartDate.get(getMonthBucketStart(receivedAt).toISOString());
      if (bucketIdx === undefined) continue;

      totalEmails++;

      const raw: PerEmailEntities = {
        topics: [],
        people: [],
        organizations: [],
        places: [],
        events: [],
        dates: [],
        numbers: [],
        prices: [],
      };

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
            raw[cat].push(canonical);
          }
        }
      };

      collectRaw('topics', analysis.topics);
      collectRaw('prices', analysis.prices);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        collectRaw('people', entities.people);
        collectRaw('organizations', entities.organizations);
        collectRaw('places', extractStoredPlaceNames(entities.places, entities.placeNames));
        collectRaw('events', entities.events);
        collectRaw('dates', entities.dates);
        collectRaw('numbers', entities.numbers);
      }

      perEmailBucketEntities.push({ bucketIdx, entities: raw });
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
    const nodeIdByBucketEntity = new Map<string, string>();

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
          nodeIdByBucketEntity.set(`${bi}:${cat}:${label}`, node.id);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Build relationship edges inside each bucket using category-order chaining.
    // -----------------------------------------------------------------------
    const edgeWeights = new Map<string, number>();
    const edges: EntityGraphEdge[] = [];
    let edgeIdx = 0;

    for (const { bucketIdx, entities } of perEmailBucketEntities) {
      const normalizedByCategory = Object.fromEntries(
        ALL_CATEGORIES.map((cat) => {
          const labels = Array.from(
            new Set(
              entities[cat].filter((label) =>
                nodeIdByBucketEntity.has(`${bucketIdx}:${cat}:${label}`),
              ),
            ),
          );

          return [cat, labels];
        }),
      ) as Record<EntityGraphNodeCategory, string[]>;

      const presentCategories = ALL_CATEGORIES.filter(
        (cat) => normalizedByCategory[cat].length > 0,
      );

      for (let i = 0; i < presentCategories.length - 1; i++) {
        const sourceCategory = presentCategories[i];
        const targetCategory = presentCategories[i + 1];

        for (const sourceLabel of normalizedByCategory[sourceCategory]) {
          const sourceId = nodeIdByBucketEntity.get(
            `${bucketIdx}:${sourceCategory}:${sourceLabel}`,
          );
          if (!sourceId) continue;

          for (const targetLabel of normalizedByCategory[targetCategory]) {
            const targetId = nodeIdByBucketEntity.get(
              `${bucketIdx}:${targetCategory}:${targetLabel}`,
            );
            if (!targetId || targetId === sourceId) continue;

            const key = `${sourceId}~${targetId}`;
            edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
          }
        }
      }
    }

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

    const { error: upsertErr } = await supabase.from('entity_flows').upsert({
      user_id: user.id,
      data: { ...graph, version: FLOW_GRAPH_VERSION } as unknown as import('@/types/supabase').Json,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) console.error('[entities/flow] upsert failed:', upsertErr);

    return NextResponse.json({ graph });
  } catch (err) {
    return handleUserError(err, 'entities/flow POST');
  }
}
