import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { extractStoredPlaceObjects, placeLabelKey } from '@/lib/place-utils';
import type { EntityPlaceMap, EntityPlaceMapPin } from '@/types';

const FETCH_LIMIT = 1000;
const MERGES_LIMIT = 500;
const PLACE_MAP_VERSION = 3;

type PlaceAggregate = {
  count: number;
  place: {
    name: string;
    latitude: number;
    longitude: number;
    displayName?: string;
  };
};

function buildAliasToCanonical(
  merges: Array<{ canonical: string; aliases: string[] }>,
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const merge of merges) {
    for (const alias of merge.aliases) {
      aliasMap.set(alias.toLowerCase(), merge.canonical);
    }
  }
  return aliasMap;
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

    const { data: row } = await supabase
      .from('entity_place_maps')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .single();

    if (!row) {
      return NextResponse.json({ graph: null });
    }

    const data = row.data as (Record<string, unknown> & { version?: number }) | null;
    if (!data || data.version !== PLACE_MAP_VERSION) {
      return NextResponse.json({ graph: null });
    }

    return NextResponse.json({
      graph: {
        pins: (data.pins ?? []) as import('@/types').EntityPlaceMapPin[],
        generatedAt: (data.generatedAt ?? '') as string,
        totalEmails: (data.totalEmails ?? 0) as number,
      } satisfies EntityPlaceMap,
    });
  } catch (err) {
    return handleUserError(err, 'entities/map GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();

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

    const placeMerges: Array<{ canonical: string; aliases: string[] }> = [];
    for (const row of mergesResult.data ?? []) {
      if (row.category !== 'places') continue;
      placeMerges.push({
        canonical: row.canonical as string,
        aliases: row.aliases as string[],
      });
    }

    const aliasMap = buildAliasToCanonical(placeMerges);
    const aggregates = new Map<string, PlaceAggregate>();
    let totalEmails = 0;

    for (const row of logsResult.data ?? []) {
      const analysis = row.email_analysis as Record<string, unknown> | undefined;
      if (!analysis) continue;

      totalEmails++;

      const entities = analysis.entities as Record<string, unknown> | undefined;
      const places = extractStoredPlaceObjects(entities?.places);
      const seenInEmail = new Set<string>();

      for (const place of places) {
        const canonical = aliasMap.get(placeLabelKey(place.name)) ?? place.name;
        const key = placeLabelKey(canonical);
        if (seenInEmail.has(key)) continue;
        seenInEmail.add(key);

        const nextPlace = {
          name: canonical,
          latitude: place.latitude,
          longitude: place.longitude,
          ...(place.displayName ? { displayName: place.displayName } : {}),
        };

        const existing = aggregates.get(key);
        if (existing) {
          existing.count += 1;
          if (placeLabelKey(existing.place.name) !== key && placeLabelKey(place.name) === key) {
            existing.place = nextPlace;
          }
          continue;
        }

        aggregates.set(key, {
          count: 1,
          place: nextPlace,
        });
      }
    }

    const pins: EntityPlaceMapPin[] = Array.from(aggregates.values())
      .sort((a, b) => b.count - a.count || a.place.name.localeCompare(b.place.name))
      .map(({ count, place }, index) => ({
        id: `p${index}`,
        label: place.name,
        category: 'places',
        count,
        latitude: place.latitude,
        longitude: place.longitude,
        displayName: place.displayName,
      }));

    const generatedAt = new Date().toISOString();
    const graph: EntityPlaceMap = {
      pins,
      generatedAt,
      totalEmails,
    };

    await supabase.from('entity_place_maps').upsert({
      user_id: user.id,
      data: { ...graph, version: PLACE_MAP_VERSION } as unknown as import('@/types/supabase').Json,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ graph });
  } catch (err) {
    return handleUserError(err, 'entities/map POST');
  }
}
