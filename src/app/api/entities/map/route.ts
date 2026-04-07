import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';
import type { EntityPlaceMap, EntityPlaceMapPin } from '@/types';

const FETCH_LIMIT = 1000;
const MERGES_LIMIT = 500;
const PLACE_MAP_VERSION = 2;
const GEOCODE_MIN_INTERVAL_MS = 1100;

const PLACE_BLOCKLIST = new Set([
  'chrome',
  'chromium',
  'firefox',
  'safari',
  'edge',
  'opera',
  'central european time',
  'cet',
  'cest',
  'gmt',
  'utc',
]);

interface CountMap {
  [value: string]: number;
}

type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName?: string;
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

function collectNormalizedPlaces(rawValues: unknown, aliasMap: Map<string, string>): string[] {
  if (!Array.isArray(rawValues)) return [];

  const places: string[] = [];
  const seen = new Set<string>();

  for (const value of rawValues) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const raw = value.trim();
    const canonical = aliasMap.get(raw.toLowerCase()) ?? raw;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    places.push(canonical);
  }

  return places;
}

function sortCountEntries(map: CountMap): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function isLikelyPlaceLabel(label: string): boolean {
  const normalized = label.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) return false;
  if (PLACE_BLOCKLIST.has(lower)) return false;
  if (/^\d{4,6}$/.test(normalized)) return false;
  if (/^[A-Z]{1,2}$/.test(normalized)) return false;
  if (/\b(time|browser|desktop|mobile|linux|windows|macos|android|ios)\b/i.test(normalized)) {
    return false;
  }

  const alphaChars = normalized.replace(/[^\p{L}]/gu, '');
  return alphaChars.length >= 3;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseCachedPins(rawPins: unknown): Map<string, GeocodeResult> {
  const cache = new Map<string, GeocodeResult>();
  if (!Array.isArray(rawPins)) return cache;

  for (const rawPin of rawPins) {
    if (!rawPin || typeof rawPin !== 'object') continue;

    const pin = rawPin as Record<string, unknown>;
    const label = typeof pin.label === 'string' ? pin.label.trim() : '';
    const latitude = Number(pin.latitude);
    const longitude = Number(pin.longitude);

    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    cache.set(label.toLowerCase(), {
      latitude,
      longitude,
      displayName: typeof pin.displayName === 'string' ? pin.displayName : undefined,
    });
  }

  return cache;
}

async function geocodePlace(label: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    q: label,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '0',
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': `Postino/1.0 (${appUrl})`,
      },
    });

    if (!response.ok) {
      console.warn('[entities/map] geocode failed:', label, response.status);
      return null;
    }

    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      type?: string;
      class?: string;
    }>;
    const first =
      results.find((result) => {
        const type = result.type?.toLowerCase() ?? '';
        const className = result.class?.toLowerCase() ?? '';
        return (
          [
            'city',
            'town',
            'village',
            'hamlet',
            'suburb',
            'quarter',
            'neighbourhood',
            'county',
            'state',
            'region',
            'province',
            'country',
            'administrative',
            'residential',
            'road',
            'house',
          ].includes(type) || ['place', 'boundary', 'highway', 'building'].includes(className)
        );
      }) ?? results[0];
    if (!first) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      displayName: first.display_name,
    };
  } catch (error) {
    console.warn('[entities/map] geocode exception:', label, error);
    return null;
  }
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
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/map] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch place map' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();

    const [snap, mergesSnap, existingDoc] = await Promise.all([
      db
        .collection('emailLogs')
        .where('userId', '==', decoded.uid)
        .orderBy('receivedAt', 'desc')
        .limit(FETCH_LIMIT)
        .get(),
      db.collection('entityMerges').where('userId', '==', decoded.uid).limit(MERGES_LIMIT).get(),
      db.collection('entityPlaceMaps').doc(decoded.uid).get(),
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
    const cachedGeocodes = existingDoc.exists
      ? parseCachedPins(existingDoc.data()?.pins)
      : new Map<string, GeocodeResult>();

    const freqs: CountMap = {};
    let totalEmails = 0;

    for (const doc of snap.docs) {
      const analysis = doc.data().emailAnalysis as Record<string, unknown> | undefined;
      if (!analysis) continue;

      totalEmails++;

      const entities = analysis.entities as Record<string, unknown> | undefined;
      const places = collectNormalizedPlaces(entities?.places, aliasMap);

      for (const place of places) {
        freqs[place] = (freqs[place] ?? 0) + 1;
      }
    }

    const pins: EntityPlaceMapPin[] = [];
    const sortedPlaces = sortCountEntries(freqs).filter(([label]) => isLikelyPlaceLabel(label));
    let nextGeocodeAt = 0;

    for (const [label, count] of sortedPlaces) {
      const cached = cachedGeocodes.get(label.toLowerCase());

      if (!cached) {
        const waitMs = nextGeocodeAt - Date.now();
        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }

      const geocode = cached ?? (await geocodePlace(label));

      if (!cached) {
        nextGeocodeAt = Date.now() + GEOCODE_MIN_INTERVAL_MS;
      }

      if (!geocode) continue;
      if (!cached) {
        cachedGeocodes.set(label.toLowerCase(), geocode);
      }

      pins.push({
        id: `p${pins.length}`,
        label,
        category: 'places',
        count,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        displayName: geocode.displayName,
      });
    }

    const generatedAt = new Date().toISOString();
    const graph: EntityPlaceMap = {
      pins,
      generatedAt,
      totalEmails,
    };

    await db.collection('entityPlaceMaps').doc(decoded.uid).set({
      ...graph,
      version: PLACE_MAP_VERSION,
      userId: decoded.uid,
      updatedAt: new Date(),
    });

    return NextResponse.json({ graph });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/map] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate place map' }, { status: 500 });
  }
}
