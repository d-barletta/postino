import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// DELETE – remove all entity-related data for the authenticated user
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();
    const uid = user.id;

    // Delete merges, suggestions, cached graphs in parallel
    const deleteResults = await Promise.all([
      supabase.from('entity_merges').delete().eq('user_id', uid),
      supabase.from('entity_merge_suggestions').delete().eq('user_id', uid),
      supabase.from('entity_relations').delete().eq('user_id', uid),
      supabase.from('entity_flows').delete().eq('user_id', uid),
      supabase.from('entity_place_maps').delete().eq('user_id', uid),
    ]);
    deleteResults.forEach(({ error }, i) => {
      if (error) console.error(`[entities/all] DELETE parallel operation ${i} failed:`, error);
    });

    // Clear extracted entity fields from email logs (set to NULL)
    // We fetch only IDs of logs with analysis and update in batches
    const { data: logRows } = await supabase
      .from('email_logs')
      .select('id, email_analysis')
      .eq('user_id', uid)
      .not('email_analysis', 'is', null);

    const analyzedIds = (logRows ?? []).map((r) => r.id);
    const BATCH_SIZE = 500;
    for (let i = 0; i < analyzedIds.length; i += BATCH_SIZE) {
      const chunk = analyzedIds.slice(i, i + BATCH_SIZE);
      // Remove entity fields from analysis JSONB using PostgreSQL jsonb subtraction
      const { error } = await supabase.rpc('remove_entity_fields_from_analysis', {
        log_ids: chunk,
      });
      if (error)
        console.error('[entities/all] remove_entity_fields_from_analysis rpc failed:', error);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'entities/all DELETE');
  }
}
