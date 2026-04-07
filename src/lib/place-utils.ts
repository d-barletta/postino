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
