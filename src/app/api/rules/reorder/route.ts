import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const MAX_REORDER_IDS = 200;

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const body = await request.json();

    if (
      !Array.isArray(body.orderedIds) ||
      body.orderedIds.some((id: unknown) => typeof id !== 'string')
    ) {
      return NextResponse.json(
        { error: 'orderedIds must be an array of strings' },
        { status: 400 },
      );
    }

    const orderedIds: string[] = body.orderedIds;
    if (orderedIds.length > MAX_REORDER_IDS) {
      return NextResponse.json(
        { error: `orderedIds cannot exceed ${MAX_REORDER_IDS} items` },
        { status: 400 },
      );
    }

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return NextResponse.json({ error: 'orderedIds cannot contain duplicates' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: userRules, error: userRulesError } = await supabase
      .from('rules')
      .select('id')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (userRulesError) throw userRulesError;

    const currentIds = (userRules ?? []).map((rule) => rule.id as string);
    const currentIdSet = new Set(currentIds);

    const invalidIds = orderedIds.filter((id) => !currentIdSet.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: 'orderedIds contains rule IDs that do not belong to the user' },
        { status: 403 },
      );
    }

    // Apply the caller-provided order first, then keep any omitted rules in their existing order.
    const finalOrderedIds = [...orderedIds, ...currentIds.filter((id) => !uniqueIds.has(id))];

    const updates = await Promise.all(
      finalOrderedIds.map((id, index) =>
        supabase.from('rules').update({ sort_order: index }).eq('id', id).eq('user_id', user.id),
      ),
    );

    const updateError = updates.find((result) => result.error)?.error;
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, updated: finalOrderedIds.length });
  } catch (error) {
    return handleUserError(error, 'rules/reorder POST');
  }
}
