import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { getUtcMonthKey, normalizeUserCreditsSnapshot } from '@/lib/credits';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      credits?: number;
    };

    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from('users')
      .select(
        'id, credits_usage_month, monthly_credits_used, monthly_credits_bonus, credits_threshold_notified',
      )
      .eq('id', uid)
      .single();

    if (!row?.id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const month = getUtcMonthKey();
    const current = normalizeUserCreditsSnapshot(row, month);

    if (body.action === 'reset_usage') {
      await supabase
        .from('users')
        .update({
          credits_usage_month: month,
          monthly_credits_used: 0,
          credits_threshold_notified: false,
        })
        .eq('id', uid);

      return NextResponse.json({ success: true });
    }

    if (body.action === 'add_bonus') {
      const bonusToAdd =
        typeof body.credits === 'number' && Number.isFinite(body.credits)
          ? Math.max(0, body.credits)
          : 0;
      if (bonusToAdd <= 0) {
        return NextResponse.json({ error: 'credits must be greater than 0' }, { status: 400 });
      }

      await supabase
        .from('users')
        .update({
          credits_usage_month: month,
          monthly_credits_used: current.used,
          monthly_credits_bonus: Number((current.bonus + bonusToAdd).toFixed(6)),
          credits_threshold_notified: false,
        })
        .eq('id', uid);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleAdminError(error, 'admin/users/[uid]/credits POST');
  }
}
