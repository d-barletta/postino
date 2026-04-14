import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EntityCategory } from '@/types';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const VALID_CATEGORIES: EntityCategory[] = [
  'topics',
  'people',
  'organizations',
  'places',
  'events',
  'dates',
  'numbers',
];

const MAX_CANONICAL_LENGTH = 200;
const MAX_ALIAS_LENGTH = 200;
const MAX_ALIASES_COUNT = 50;

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
      .from('entity_merges')
      .select('*')
      .eq('user_id', uid)
      .order('canonical', { ascending: true })
      .limit(500);

    const merges = (rows ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      canonical: row.canonical,
      aliases: row.aliases,
      createdAt: row.created_at ?? null,
    }));

    return NextResponse.json({ merges });
  } catch (err) {
    return handleUserError(err, 'entities/merges GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const { category, canonical, aliases } = body;

    if (!category || !VALID_CATEGORIES.includes(category as EntityCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (!canonical || typeof canonical !== 'string' || !canonical.trim()) {
      return NextResponse.json({ error: 'Canonical name is required' }, { status: 400 });
    }

    if ((canonical as string).trim().length > MAX_CANONICAL_LENGTH) {
      return NextResponse.json(
        { error: `Canonical name must be at most ${MAX_CANONICAL_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(aliases) ||
      aliases.length < 2 ||
      aliases.length > MAX_ALIASES_COUNT ||
      aliases.some((a) => typeof a !== 'string' || !a.trim())
    ) {
      return NextResponse.json(
        { error: `At least two and at most ${MAX_ALIASES_COUNT} non-empty aliases are required` },
        { status: 400 },
      );
    }

    if (aliases.some((a) => typeof a === 'string' && a.trim().length > MAX_ALIAS_LENGTH)) {
      return NextResponse.json(
        { error: `Each alias must be at most ${MAX_ALIAS_LENGTH} characters` },
        { status: 400 },
      );
    }

    const trimmedCanonical = (canonical as string).trim();
    const rawAliases: string[] = (aliases as string[]).map((a) => a.trim());

    // Deduplicate aliases case-insensitively, preserving first occurrence
    const seenLower = new Set<string>();
    const trimmedAliases: string[] = [];
    for (const a of rawAliases) {
      const lc = a.toLowerCase();
      if (!seenLower.has(lc)) {
        seenLower.add(lc);
        trimmedAliases.push(a);
      }
    }

    if (trimmedAliases.length < 2) {
      return NextResponse.json(
        { error: 'At least two non-empty aliases are required' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Find all existing merges in this category that overlap with the incoming aliases
    const { data: existingRows } = await supabase
      .from('entity_merges')
      .select('id, canonical, aliases')
      .eq('user_id', user.id)
      .eq('category', category as string)
      .limit(500);

    const overlappingRows = (existingRows ?? []).filter((row) => {
      const existingAliases = row.aliases as string[];
      return trimmedAliases.some((a) =>
        existingAliases.some((ea) => ea.toLowerCase() === a.toLowerCase()),
      );
    });

    if (overlappingRows.length > 0) {
      const unifiedSeenLower = new Set<string>();
      const unifiedAliases: string[] = [];
      for (const a of [
        ...trimmedAliases,
        ...overlappingRows.flatMap((row) => row.aliases as string[]),
      ]) {
        const lc = a.toLowerCase();
        if (!unifiedSeenLower.has(lc)) {
          unifiedSeenLower.add(lc);
          unifiedAliases.push(a);
        }
      }

      const [baseRow, ...rowsToDelete] = overlappingRows;

      await supabase
        .from('entity_merges')
        .update({ canonical: trimmedCanonical, aliases: unifiedAliases })
        .eq('id', baseRow.id);

      if (rowsToDelete.length > 0) {
        await supabase
          .from('entity_merges')
          .delete()
          .in(
            'id',
            rowsToDelete.map((r) => r.id),
          );
      }

      return NextResponse.json({ id: baseRow.id }, { status: 200 });
    }

    const { data: inserted } = await supabase
      .from('entity_merges')
      .insert({
        user_id: user.id,
        category: category as string,
        canonical: trimmedCanonical,
        aliases: trimmedAliases,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return NextResponse.json({ id: inserted?.id }, { status: 201 });
  } catch (err) {
    return handleUserError(err, 'entities/merges POST');
  }
}
