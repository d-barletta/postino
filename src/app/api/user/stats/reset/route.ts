import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const { id: uid } = await verifyUserRequest(request);
    const supabase = createAdminClient();

    const { count: logCount } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);

    await supabase
      .from('email_logs')
      .update({ tokens_used: 0, estimated_cost: 0 })
      .eq('user_id', uid);

    return NextResponse.json({ success: true, updatedCount: logCount ?? 0 });
  } catch (err) {
    return handleUserError(err, 'user/stats/reset POST');
  }
}
