import 'server-only';

import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import type { EmailAnalysisPlace } from '@/types';
import { normalizePlaceLabel, placeLabelKey } from '@/lib/place-utils';

const GEOCODE_CACHE_COLLECTION = 'placeGeocodes';
const GEOCODE_MIN_INTERVAL_MS = 1100;

// ---------------------------------------------------------------------------
// Google Maps Geocoding
// ---------------------------------------------------------------------------

async function geocodePlaceWithGoogleMaps(
  label: string,
  apiKey: string,
): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({ address: label, key: apiKey });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      console.warn('[place-geocoding] Google Maps geocode failed:', label, response.status);
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };

    if (data.status !== 'OK' || !data.results?.length) {
      if (data.status !== 'ZERO_RESULTS') {
        console.warn('[place-geocoding] Google Maps status:', data.status, label);
      }
      return null;
    }

    const first = data.results[0];
    const latitude = first?.geometry?.location?.lat;
    const longitude = first?.geometry?.location?.lng;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      name: normalizePlaceLabel(label),
      latitude: latitude as number,
      longitude: longitude as number,
      ...(typeof first?.formatted_address === 'string' && first.formatted_address.trim()
        ? { displayName: first.formatted_address.trim() }
        : {}),
    };
  } catch (error) {
    console.warn('[place-geocoding] Google Maps geocode exception:', label, error);
    return null;
  }
}

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

type GeocodeResult = EmailAnalysisPlace;

let nextGeocodeAt = 0;

function getPlaceCacheId(label: string): string {
  return createHash('sha1').update(placeLabelKey(label)).digest('hex');
}

function isLikelyPlaceLabel(label: string): boolean {
  const normalized = normalizePlaceLabel(label);
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForGeocodeWindow(): Promise<void> {
  const waitMs = nextGeocodeAt - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextGeocodeAt = Date.now() + GEOCODE_MIN_INTERVAL_MS;
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
      console.warn('[place-geocoding] geocode failed:', label, response.status);
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
      name: normalizePlaceLabel(label),
      latitude,
      longitude,
      ...(typeof first.display_name === 'string' && first.display_name.trim()
        ? { displayName: first.display_name.trim() }
        : {}),
    };
  } catch (error) {
    console.warn('[place-geocoding] geocode exception:', label, error);
    return null;
  }
}

async function readCachedPlace(label: string): Promise<GeocodeResult | null> {
  const db = adminDb();
  const doc = await db.collection(GEOCODE_CACHE_COLLECTION).doc(getPlaceCacheId(label)).get();
  if (!doc.exists) return null;

  const data = doc.data();
  const latitude = Number(data?.latitude);
  const longitude = Number(data?.longitude);
  const name = typeof data?.name === 'string' ? normalizePlaceLabel(data.name) : '';

  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name,
    latitude,
    longitude,
    ...(typeof data?.displayName === 'string' && data.displayName.trim()
      ? { displayName: data.displayName.trim() }
      : {}),
  };
}

async function writeCachedPlace(place: GeocodeResult): Promise<void> {
  const db = adminDb();
  await db
    .collection(GEOCODE_CACHE_COLLECTION)
    .doc(getPlaceCacheId(place.name))
    .set({
      name: place.name,
      normalizedLabel: placeLabelKey(place.name),
      latitude: place.latitude,
      longitude: place.longitude,
      ...(place.displayName ? { displayName: place.displayName } : {}),
      updatedAt: new Date(),
    });
}

export async function geocodePlaceName(
  label: string,
  googleMapsApiKey?: string,
): Promise<GeocodeResult | null> {
  const normalized = normalizePlaceLabel(label);
  if (!isLikelyPlaceLabel(normalized)) return null;

  const cached = await readCachedPlace(normalized);
  if (cached) return cached;

  const resolvedKey = googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '';

  let geocoded: GeocodeResult | null = null;

  if (resolvedKey) {
    geocoded = await geocodePlaceWithGoogleMaps(normalized, resolvedKey);
  }

  if (!geocoded) {
    await waitForGeocodeWindow();
    geocoded = await geocodePlace(normalized);
  }

  if (!geocoded) return null;

  await writeCachedPlace(geocoded);
  return geocoded;
}

export async function geocodePlaceNames(
  labels: string[],
  googleMapsApiKey?: string,
): Promise<GeocodeResult[]> {
  const result: GeocodeResult[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const normalized = normalizePlaceLabel(label);
    const key = placeLabelKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);

    const place = await geocodePlaceName(normalized, googleMapsApiKey);
    if (!place) continue;
    result.push(place);
  }

  return result;
}
