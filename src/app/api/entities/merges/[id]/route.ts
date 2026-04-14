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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing merge ID' }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { category, canonical, aliases } = body;

    if (!category || !VALID_CATEGORIES.includes(category as EntityCategory)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (!canonical || typeof canonical !== 'string' || !canonical.trim()) {
      return NextResponse.json({ error: 'Canonical name is required' }, { status: 400 });
    }

    if (
      !Array.isArray(aliases) ||
      aliases.length < 2 ||
      aliases.some((a) => typeof a !== 'string' || !a.trim())
    ) {
      return NextResponse.json(
        { error: 'At least two non-empty aliases are required' },
        { status: 400 },
      );
    }

    const trimmedCanonical = (canonical as string).trim();
    const trimmedAliases: string[] = (aliases as string[]).map((a) => a.trim());

    const supabase = createAdminClient();
    const { data: snap } = await supabase
      .from('entity_merges')
      .select('id, user_id, aliases')
      .eq('id', id)
      .single();

    if (!snap) {
      return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
    }

    if (snap.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find all OTHER merges in this category that overlap with the incoming aliases
    const { data: existingRows } = await supabase
      .from('entity_merges')
      .select('id, aliases')
      .eq('user_id', user.id)
      .eq('category', category as string)
      .neq('id', id)
      .limit(500);

    const overlappingRows = (existingRows ?? []).filter((row) => {
      const existingAliases = row.aliases as string[];
      return trimmedAliases.some((a) => existingAliases.includes(a));
    });

    if (overlappingRows.length > 0) {
      const unifiedAliases = Array.from(
        new Set([...trimmedAliases, ...overlappingRows.flatMap((row) => row.aliases as string[])]),
      );

      const { error: updateErr } = await supabase
        .from('entity_merges')
        .update({ canonical: trimmedCanonical, aliases: unifiedAliases })
        .eq('id', id);
      if (updateErr)
        console.error('[entities/merges/[id]] PATCH unified update failed:', updateErr);

      const { error: deleteErr } = await supabase
        .from('entity_merges')
        .delete()
        .in(
          'id',
          overlappingRows.map((r) => r.id),
        );
      if (deleteErr)
        console.error('[entities/merges/[id]] PATCH overlapping delete failed:', deleteErr);

      return NextResponse.json({ success: true });
    }

    const { error: updateErr } = await supabase
      .from('entity_merges')
      .update({ canonical: trimmedCanonical, aliases: trimmedAliases })
      .eq('id', id);
    if (updateErr) console.error('[entities/merges/[id]] PATCH update failed:', updateErr);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'entities/merges/[id] PATCH');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Missing merge ID' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: snap } = await supabase
      .from('entity_merges')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!snap) {
      return NextResponse.json({ error: 'Merge not found' }, { status: 404 });
    }

    if (snap.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteErr } = await supabase.from('entity_merges').delete().eq('id', id);
    if (deleteErr) console.error('[entities/merges/[id]] DELETE failed:', deleteErr);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'entities/merges/[id] DELETE');
  }
}
