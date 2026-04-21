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

    // Verify ownership of all provided rule IDs in one batch read.
    const { data: rules } = await supabase.from('rules').select('id, user_id').in('id', orderedIds);

    const ruleMap = new Map((rules ?? []).map((r) => [r.id, r]));
    const ownedIds = orderedIds.filter((id) => ruleMap.get(id)?.user_id === user.id);

    await Promise.all(
      ownedIds.map((id) =>
        supabase
          .from('rules')
          .update({ sort_order: orderedIds.indexOf(id) })
          .eq('id', id),
      ),
    );

    return NextResponse.json({ success: true, updated: ownedIds.length });
  } catch (error) {
    return handleUserError(error, 'rules/reorder POST');
  }
}
