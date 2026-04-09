import type { EmailAnalysisPlace } from '@/types';

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePlaceLabel(label: string): string {
  return normalizeWhitespace(label);
}

export function placeLabelKey(label: string): string {
  return normalizePlaceLabel(label).toLowerCase();
}

export function normalizeUniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeWhitespace(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

/**
 * Deduplication key for labelled number entities.
 * Strips spaces, hyphens, dots, parentheses, and slashes so that equivalent
 * representations of the same number (e.g. "+39 02 1234 5678" vs "+39-02-12345678")
 * collapse to the same key.
 */
function numberEntityKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-().\/]/g, '');
}

/**
 * Like `normalizeUniqueStrings` but uses `numberEntityKey` for deduplication
 * so that the same number written with different separators is stored only once.
 */
export function normalizeUniqueNumberStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeWhitespace(value);
    if (!normalized) continue;

    const key = numberEntityKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function isEmailAnalysisPlace(value: unknown): value is EmailAnalysisPlace {
  if (!value || typeof value !== 'object') return false;

  const place = value as Record<string, unknown>;
  return (
    typeof place.name === 'string' &&
    normalizePlaceLabel(place.name).length > 0 &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

export function extractStoredPlaceObjects(values: unknown): EmailAnalysisPlace[] {
  if (!Array.isArray(values)) return [];

  const result: EmailAnalysisPlace[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!isEmailAnalysisPlace(value)) continue;

    const name = normalizePlaceLabel(value.name);
    const key = placeLabelKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      name,
      latitude: value.latitude,
      longitude: value.longitude,
      ...(typeof value.displayName === 'string' && value.displayName.trim()
        ? { displayName: normalizeWhitespace(value.displayName) }
        : {}),
    });
  }

  return result;
}

export function extractStoredPlaceNames(values: unknown, fallbackPlaceNames?: unknown): string[] {
  const explicitNames = normalizeUniqueStrings(fallbackPlaceNames);
  if (explicitNames.length > 0) return explicitNames;

  if (!Array.isArray(values)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const name =
      typeof value === 'string'
        ? normalizePlaceLabel(value)
        : isEmailAnalysisPlace(value)
          ? normalizePlaceLabel(value.name)
          : '';

    if (!name) continue;

    const key = placeLabelKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
}
