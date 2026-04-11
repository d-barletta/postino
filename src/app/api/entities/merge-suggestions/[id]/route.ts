import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// PATCH – accept or reject a suggestion
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let uid: string;
  try {
    const user = await verifyUserRequest(request);
    uid = user.id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const { status } = body;

    if (status !== 'accepted' && status !== 'rejected') {
      return NextResponse.json(
        { error: 'Status must be "accepted" or "rejected"' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: snap } = await supabase
      .from('entity_merge_suggestions')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (!snap) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    if (snap.user_id !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('entity_merge_suggestions')
      .update({ status })
      .eq('id', id);
    if (error) console.error('[entities/merge-suggestions/[id]] update failed:', error);

    return NextResponse.json({ id, status });
  } catch (err) {
    return handleUserError(err, 'entities/merge-suggestions/[id] PATCH');
  }
}
