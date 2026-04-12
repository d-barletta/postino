import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
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
    const user = await verifyUserRequest(request);

    const supabase = createAdminClient();

    // Fetch email logs and entity merges in parallel
    const [{ data: emailLogs }, { data: mergeRows }] = await Promise.all([
      supabase
        .from('email_logs')
        .select('email_analysis')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('entity_merges')
        .select('category, canonical, aliases')
        .eq('user_id', user.id)
        .limit(MERGES_LIMIT),
    ]);

    // Group merges by category
    const mergesByCategory: Record<string, Array<{ canonical: string; aliases: string[] }>> = {};
    for (const row of mergeRows ?? []) {
      const cat = row.category as string;
      if (!mergesByCategory[cat]) mergesByCategory[cat] = [];
      mergesByCategory[cat].push({
        canonical: row.canonical as string,
        aliases: row.aliases as string[],
      });
    }

    const topics: CountMap = {};
    const people: CountMap = {};
    const organizations: CountMap = {};
    const places: CountMap = {};
    const events: CountMap = {};
    const dates: CountMap = {};
    const numbers: CountMap = {};
    const prices: CountMap = {};
    const languages: CountMap = {};

    let totalEmails = 0;

    for (const row of emailLogs ?? []) {
      const analysis = row.email_analysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      totalEmails++;
      incrementAll(topics, analysis.topics);
      increment(languages, analysis.language);
      incrementAll(prices, analysis.prices);
      const entities = analysis.entities as Record<string, unknown> | undefined;
      if (entities) {
        incrementAll(people, entities.people);
        incrementAll(organizations, entities.organizations);
        incrementAll(places, extractStoredPlaceNames(entities.places, entities.placeNames));
        incrementAll(events, entities.events);
        incrementAll(dates, entities.dates);
        incrementAll(numbers, entities.numbers);
      }
    }

    // Apply user-defined merges
    if (mergesByCategory.topics) applyMerges(topics, mergesByCategory.topics);
    if (mergesByCategory.people) applyMerges(people, mergesByCategory.people);
    if (mergesByCategory.organizations) applyMerges(organizations, mergesByCategory.organizations);
    if (mergesByCategory.places) applyMerges(places, mergesByCategory.places);
    if (mergesByCategory.events) applyMerges(events, mergesByCategory.events);
    if (mergesByCategory.dates) applyMerges(dates, mergesByCategory.dates);
    if (mergesByCategory.numbers) applyMerges(numbers, mergesByCategory.numbers);
    if (mergesByCategory.prices) applyMerges(prices, mergesByCategory.prices);

    return NextResponse.json({
      topics: toSortedArray(topics),
      people: toSortedArray(people),
      organizations: toSortedArray(organizations),
      places: toSortedArray(places),
      events: toSortedArray(events),
      dates: toSortedArray(dates),
      numbers: toSortedArray(numbers),
      prices: toSortedArray(prices),
      languages: toSortedArray(languages),
      totalEmails,
    });
  } catch (err) {
    return handleUserError(err, 'email/knowledge GET');
  }
}
