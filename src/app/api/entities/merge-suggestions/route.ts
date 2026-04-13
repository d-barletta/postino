import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOpenRouterClient, withLlmRetry } from '@/lib/openrouter';
import { jsonrepair } from 'jsonrepair';
import type { EntityCategory } from '@/types';
import { verifyUserRequest } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';

const VALID_CATEGORIES: EntityCategory[] = [
  'topics',
  'people',
  'organizations',
  'places',
  'events',
  'dates',
  'numbers',
];

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

const FETCH_LIMIT = 500;
const MERGES_LIMIT = 500;
const TOP_N = 50;

interface CountMap {
  [value: string]: number;
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

function toTopN(map: CountMap, n = TOP_N): string[] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => v);
}

// ---------------------------------------------------------------------------
// GET – return existing suggestions for the user
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  let uid: string;
  try {
    const user = await verifyUserRequest(request);
    uid = user.id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const { data: rows } = await supabase
      .from('entity_merge_suggestions')
      .select('*')
      .eq('user_id', uid)
      .order('suggested_canonical', { ascending: true })
      .limit(200);

    const suggestions = (rows ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      aliases: row.aliases,
      suggestedCanonical: row.suggested_canonical,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at ?? null,
    }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('[entities/merge-suggestions] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST – ask AI to generate merge suggestions from the user's knowledge data
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    const user = await verifyUserRequest(request);
    uid = user.id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // Fetch user's analysis output language preference
    const { data: userRow } = await supabase
      .from('users')
      .select('analysis_output_language')
      .eq('id', uid)
      .single();
    const langCode = (userRow?.analysis_output_language as string | undefined)
      ?.toLowerCase()
      .trim();
    const langName = langCode ? (LANGUAGE_NAMES[langCode] ?? langCode) : null;
    const languageInstruction = langName
      ? `You MUST write the "reason" field in ${langName}. This is mandatory — do not use English unless ${langName} is English.`
      : '';

    // Check if there are already pending suggestions — if so, don't regenerate
    const { data: pendingRows } = await supabase
      .from('entity_merge_suggestions')
      .select('id')
      .eq('user_id', uid)
      .eq('status', 'pending')
      .limit(1);

    if (pendingRows && pendingRows.length > 0) {
      return NextResponse.json(
        { error: 'Complete existing suggestions before generating new ones' },
        { status: 409 },
      );
    }

    // Fetch email logs and existing merges in parallel
    const [logsResult, mergesResult] = await Promise.all([
      supabase
        .from('email_logs')
        .select('email_analysis')
        .eq('user_id', uid)
        .not('email_analysis', 'is', null)
        .order('received_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('entity_merges')
        .select('category, aliases')
        .eq('user_id', uid)
        .limit(MERGES_LIMIT),
    ]);

    // Gather entity counts from email analysis
    const topics: CountMap = {};
    const people: CountMap = {};
    const organizations: CountMap = {};
    const places: CountMap = {};
    const events: CountMap = {};
    const dates: CountMap = {};
    const numbers: CountMap = {};

    for (const row of logsResult.data ?? []) {
      const analysis = row.email_analysis as Record<string, unknown> | undefined;
      if (!analysis) continue;
      incrementAll(topics, analysis.topics);
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

    // Collect already-merged aliases to exclude them from suggestions
    const mergedAliasesByCategory: Record<string, Set<string>> = {};
    for (const row of mergesResult.data ?? []) {
      const cat = row.category as string;
      if (!mergedAliasesByCategory[cat]) mergedAliasesByCategory[cat] = new Set();
      for (const alias of row.aliases as string[]) {
        mergedAliasesByCategory[cat].add(alias.toLowerCase());
      }
    }

    // Build the entity data payload for the AI prompt
    const categoryEntities: Record<string, string[]> = {
      topics: toTopN(topics),
      people: toTopN(people),
      organizations: toTopN(organizations),
      places: toTopN(places),
      events: toTopN(events),
      dates: toTopN(dates),
      numbers: toTopN(numbers),
    };

    // Filter out already-merged entries
    for (const cat of VALID_CATEGORIES) {
      const merged = mergedAliasesByCategory[cat];
      if (merged) {
        categoryEntities[cat] = categoryEntities[cat].filter((v) => !merged.has(v.toLowerCase()));
      }
    }

    // Check if there's enough data to generate suggestions
    const totalEntities = Object.values(categoryEntities).reduce((acc, arr) => acc + arr.length, 0);
    if (totalEntities === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build AI prompt
    const entityListText = VALID_CATEGORIES.filter((cat) => categoryEntities[cat].length > 0)
      .map((cat) => `${cat}: ${categoryEntities[cat].join(', ')}`)
      .join('\n');

    const systemPrompt = [
      languageInstruction,
      `You are an expert at identifying duplicate or equivalent named entities extracted from emails.
Your task is to analyze lists of entities and identify groups of values that likely refer to the same real-world entity and should be merged.

Rules:
- Only suggest merges when you are highly confident the entities are the same thing (e.g. abbreviations, alternate spellings, company name variations).
- Do not suggest merging clearly distinct entities.
- Each suggestion must have at least 2 aliases.
- Prefer the most complete/formal name as the suggestedCanonical.
- Return your response as a valid JSON object with a "suggestions" array.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const reasonLanguageNote = langName ? ` (in ${langName})` : '';
    const userPrompt = `Here are the entities extracted from the user's emails, grouped by category:

${entityListText}

Identify groups of entities that likely refer to the same thing and should be merged.
Return a JSON object with this structure:
{
  "suggestions": [
    {
      "category": "<category name, one of: topics, people, organizations, places, events>",
      "aliases": ["<entity1>", "<entity2>", ...],
      "suggestedCanonical": "<best representative name>",
      "reason": "<brief explanation in 1 sentence${reasonLanguageNote}>"
    }
  ]
}

Return an empty array if no confident merges are found. Only include suggestions where you are highly confident.`;

    const { client, model } = await getOpenRouterClient();

    const response = await withLlmRetry(
      () =>
        client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
      'entities/merge-suggestions',
    );

    const content = response.choices[0]?.message?.content || '{}';
    let parsed: { suggestions?: unknown[] };
    try {
      parsed = JSON.parse(jsonrepair(content)) as { suggestions?: unknown[] };
    } catch {
      parsed = { suggestions: [] };
    }

    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    // Validate and filter suggestions
    const validSuggestions: Array<{
      category: EntityCategory;
      aliases: string[];
      suggestedCanonical: string;
      reason: string;
    }> = [];

    for (const s of rawSuggestions) {
      if (!s || typeof s !== 'object') continue;
      const item = s as Record<string, unknown>;
      const category = item.category as string;
      const aliases = item.aliases;
      const suggestedCanonical = item.suggestedCanonical;
      const reason = item.reason;

      if (
        !VALID_CATEGORIES.includes(category as EntityCategory) ||
        !Array.isArray(aliases) ||
        aliases.length < 2 ||
        aliases.some((a) => typeof a !== 'string' || !a.trim()) ||
        typeof suggestedCanonical !== 'string' ||
        !suggestedCanonical.trim() ||
        typeof reason !== 'string'
      ) {
        continue;
      }

      // Deduplicate aliases case-insensitively
      const seen = new Set<string>();
      const dedupedAliases: string[] = [];
      for (const a of (aliases as string[]).map((x) => x.trim())) {
        const lc = a.toLowerCase();
        if (!seen.has(lc)) {
          seen.add(lc);
          dedupedAliases.push(a);
        }
      }
      // Skip if fewer than 2 distinct aliases after deduplication
      if (dedupedAliases.length < 2) continue;

      validSuggestions.push({
        category: category as EntityCategory,
        aliases: dedupedAliases,
        suggestedCanonical: (suggestedCanonical as string).trim(),
        reason: (reason as string).trim(),
      });
    }

    // Delete old rejected/accepted suggestions before storing new ones
    const { error: deleteErr } = await supabase
      .from('entity_merge_suggestions')
      .delete()
      .eq('user_id', uid);
    if (deleteErr)
      console.error('[entities/merge-suggestions] DELETE old suggestions failed:', deleteErr);

    // Store new suggestions in a single bulk insert to reduce DB round trips
    const now = new Date().toISOString();
    if (validSuggestions.length === 0) {
      return NextResponse.json({ suggestions: [] }, { status: 201 });
    }

    const { data: insertedRows } = await supabase
      .from('entity_merge_suggestions')
      .insert(
        validSuggestions.map((s) => ({
          user_id: uid,
          category: s.category,
          aliases: s.aliases,
          suggested_canonical: s.suggestedCanonical,
          reason: s.reason,
          status: 'pending',
          created_at: now,
        })),
      )
      .select('id, category, aliases, suggested_canonical, reason, status, created_at');

    const storedSuggestions = (insertedRows ?? []).map((row) => ({
      id: row.id,
      userId: uid,
      category: row.category,
      aliases: row.aliases as string[],
      suggestedCanonical: row.suggested_canonical,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at ?? now,
    }));

    return NextResponse.json({ suggestions: storedSuggestions }, { status: 201 });
  } catch (err) {
    const isAuthError =
      err instanceof Error &&
      (err.message.includes('auth') ||
        err.message.includes('token') ||
        err.message.includes('Unauthorized'));
    if (isAuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[entities/merge-suggestions] POST error:', err);
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
}
