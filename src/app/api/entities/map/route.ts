import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
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
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    const doc = await db.collection('entityPlaceMaps').doc(decoded.uid).get();
    if (!doc.exists) {
      return NextResponse.json({ graph: null });
    }

    const data = doc.data();
    if (data?.version !== PLACE_MAP_VERSION) {
      return NextResponse.json({ graph: null });
    }

    return NextResponse.json({
      graph: {
        pins: data?.pins ?? [],
        generatedAt: data?.generatedAt ?? null,
        totalEmails: data?.totalEmails ?? 0,
      } satisfies EntityPlaceMap,
    });
  } catch (err) {
    return handleUserError(err, 'entities/map GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    const [snap, mergesSnap] = await Promise.all([
      db
        .collection('emailLogs')
        .where('userId', '==', decoded.uid)
        .orderBy('receivedAt', 'desc')
        .limit(FETCH_LIMIT)
        .get(),
      db.collection('entityMerges').where('userId', '==', decoded.uid).limit(MERGES_LIMIT).get(),
    ]);

    const placeMerges: Array<{ canonical: string; aliases: string[] }> = [];
    for (const doc of mergesSnap.docs) {
      const data = doc.data();
      if (data.category !== 'places') continue;
      placeMerges.push({
        canonical: data.canonical as string,
        aliases: data.aliases as string[],
      });
    }

    const aliasMap = buildAliasToCanonical(placeMerges);
    const aggregates = new Map<string, PlaceAggregate>();
    let totalEmails = 0;

    for (const doc of snap.docs) {
      const analysis = doc.data().emailAnalysis as Record<string, unknown> | undefined;
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

    await db
      .collection('entityPlaceMaps')
      .doc(decoded.uid)
      .set({
        ...graph,
        version: PLACE_MAP_VERSION,
        userId: decoded.uid,
        updatedAt: new Date(),
      });

    return NextResponse.json({ graph });
  } catch (err) {
    return handleUserError(err, 'entities/map POST');
  }
}
