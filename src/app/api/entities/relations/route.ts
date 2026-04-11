import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
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
  'dates',
  'numbers',
];

interface CountMap {
  [value: string]: number;
}

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
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

    const { data: row } = await supabase
      .from('entity_relations')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .single();

    if (!row) {
      return NextResponse.json({ graph: null });
    }

    const data = row.data as EntityRelationGraph | null;
    return NextResponse.json({
      graph: {
        nodes: data?.nodes ?? [],
        edges: data?.edges ?? [],
        generatedAt: data?.generatedAt ?? '',
        totalEmails: data?.totalEmails ?? 0,
      } satisfies EntityRelationGraph,
    });
  } catch (err) {
    return handleUserError(err, 'entities/relations GET');
  }
}

// ---------------------------------------------------------------------------
// POST – compute and store a fresh relation graph
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

    // Fetch email logs and entity merges in parallel
    const [logsResult, mergesResult] = await Promise.all([
      supabase
        .from('email_logs')
        .select('email_analysis')
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
      dates: {},
      numbers: {},
    };

    type PerEmailEntities = Record<EntityGraphNodeCategory, string[]>;
    const perEmailRaw: PerEmailEntities[] = [];

    let totalEmails = 0;

    for (const row of logsResult.data ?? []) {
      const analysis = row.email_analysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      totalEmails++;

      const raw: PerEmailEntities = {
        topics: [],
        tags: [],
        people: [],
        organizations: [],
        places: [],
        events: [],
        dates: [],
        numbers: [],
      };

      const collectRaw = (cat: EntityGraphNodeCategory, values: unknown) => {
        if (!Array.isArray(values)) return;
        for (const v of values) {
          if (typeof v === 'string' && v.trim()) {
            const key = v.trim().toLowerCase();
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
        collectRaw('dates', entities.dates);
        collectRaw('numbers', entities.numbers);
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

    const { error: upsertErr } = await supabase.from('entity_relations').upsert({
      user_id: user.id,
      data: graph as unknown as import('@/types/supabase').Json,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) console.error('[entities/relations] upsert failed:', upsertErr);

    return NextResponse.json({ graph });
  } catch (err) {
    return handleUserError(err, 'entities/relations POST');
  }
}
