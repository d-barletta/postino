import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// DELETE – remove all AI analysis data for the authenticated user's emails:
//   • email_logs[].email_analysis    – structured AI analysis
//   • email_logs[].tokens_used       – AI token usage
//   • email_logs[].estimated_cost    – AI cost estimate
//   • email_logs[].estimated_credits – user-facing credits estimate
//   • email_logs[].processed_body    – AI-generated processed content
//   • entity_merges                  – user-defined entity merge rules
//   • entity_merge_suggestions       – AI merge suggestions
//   • entity_relations/{user_id}     – cached relation graph
//   • entity_flows/{user_id}         – cached flow graph
//   • entity_place_maps/{user_id}    – cached place map
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();
    const uid = user.id;

    // Clear AI fields from all email logs
    await supabase
      .from('email_logs')
      .update({
        email_analysis: null,
        tokens_used: null,
        estimated_cost: null,
        estimated_credits: null,
        processed_body: null,
      })
      .eq('user_id', uid);

    // Delete entity merges and suggestions (derived from analysis)
    await Promise.all([
      supabase.from('entity_merges').delete().eq('user_id', uid),
      supabase.from('entity_merge_suggestions').delete().eq('user_id', uid),
    ]);

    // Delete cached graphs
    await Promise.all([
      supabase.from('entity_relations').delete().eq('user_id', uid),
      supabase.from('entity_flows').delete().eq('user_id', uid),
      supabase.from('entity_place_maps').delete().eq('user_id', uid),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'email/clear-analysis DELETE');
  }
}
