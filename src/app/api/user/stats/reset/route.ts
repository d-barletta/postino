import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { getUtcMonthKey } from '@/lib/credits';

export async function POST(request: NextRequest) {
  try {
    const { id: uid } = await verifyAdminRequest(request);
    const supabase = createAdminClient();

    const { count: logCount } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid);

    await Promise.all([
      supabase
        .from('email_logs')
        .update({ tokens_used: 0, estimated_cost: 0, estimated_credits: 0 })
        .eq('user_id', uid),
      supabase
        .from('users')
        .update({
          memory_tokens_used: 0,
          memory_estimated_cost: 0,
          monthly_credits_used: 0,
          credits_usage_month: getUtcMonthKey(),
          credits_threshold_notified: false,
        })
        .eq('id', uid),
    ]);

    return NextResponse.json({ success: true, updatedCount: logCount ?? 0 });
  } catch (err) {
    return handleAdminError(err, 'user/stats/reset POST');
  }
}
