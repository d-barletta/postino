import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import {
  computeMonthlyCreditsLimit,
  dollarsToCredits,
  getUtcMonthKey,
  normalizeUserCreditsSnapshot,
  resolveCreditSettings,
} from '@/lib/credits';

type StatsPeriod = '24h' | '7d' | '30d' | 'all';
const VALID_PERIODS = new Set<StatsPeriod>(['24h', '7d', '30d', 'all']);

const PERIOD_MS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') ?? 'all';
    const period: StatsPeriod = VALID_PERIODS.has(periodParam as StatsPeriod)
      ? (periodParam as StatsPeriod)
      : 'all';

    const from = period !== 'all' ? new Date(Date.now() - PERIOD_MS[period]) : null;

    const buildBaseCount = (): any => {
      let q = supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (from) q = q.gte('received_at', from.toISOString());
      return q;
    };

    const buildBaseAgg = (): any => {
      return supabase.rpc('get_user_email_stats_aggregate', {
        p_user_id: user.id,
        from_date: from ? from.toISOString() : null,
      });
    };

    const [
      totalResult,
      forwardedResult,
      errorResult,
      skippedResult,
      aggResult,
      userResult,
      settingsResult,
    ] = await Promise.all([
      buildBaseCount(),
      buildBaseCount().eq('status', 'forwarded'),
      buildBaseCount().eq('status', 'error'),
      buildBaseCount().eq('status', 'skipped'),
      buildBaseAgg(),
      supabase
        .from('users')
        .select(
          'memory_tokens_used, memory_estimated_cost, monthly_credits_used, monthly_credits_bonus, credits_usage_month',
        )
        .eq('id', user.id)
        .single(),
      supabase.from('settings').select('data').eq('id', 'global').single(),
    ]);

    const aggData = (aggResult.data?.[0] ?? {}) as {
      total_tokens?: number | null;
      total_cost?: number | null;
    };
    const userData = userResult.data as {
      memory_tokens_used: number | null;
      memory_estimated_cost: number | null;
      monthly_credits_used: number | null;
      monthly_credits_bonus: number | null;
      credits_usage_month: string | null;
    } | null;
    const settingsData = (settingsResult.data?.data as Record<string, unknown> | undefined) ?? {};
    const creditSettings = resolveCreditSettings(settingsData);

    const memoryTokensUsed =
      typeof userData?.memory_tokens_used === 'number' ? userData.memory_tokens_used : 0;
    const memoryEstimatedCost =
      typeof userData?.memory_estimated_cost === 'number' ? userData.memory_estimated_cost : 0;
    const totalEstimatedCost = (aggData?.total_cost ?? 0) + memoryEstimatedCost;
    const totalCreditsUsed = dollarsToCredits(
      totalEstimatedCost,
      creditSettings.creditsPerDollarFactor,
    );
    const currentMonth = getUtcMonthKey();
    const monthlyCredits = normalizeUserCreditsSnapshot(userData, currentMonth);
    const monthlyCreditsLimit = computeMonthlyCreditsLimit(
      creditSettings.freeCreditsPerMonth,
      monthlyCredits.bonus,
    );
    const monthlyCreditsRemaining = Math.max(0, monthlyCreditsLimit - monthlyCredits.used);

    const stats = {
      totalEmailsReceived: totalResult.count ?? 0,
      totalEmailsForwarded: forwardedResult.count ?? 0,
      totalEmailsError: errorResult.count ?? 0,
      totalEmailsSkipped: skippedResult.count ?? 0,
      // Memory chat token usage is a lifetime running total; always included regardless of period.
      totalTokensUsed: (aggData?.total_tokens ?? 0) + memoryTokensUsed,
      totalEstimatedCost,
      totalCreditsUsed,
      monthlyCreditsUsed: monthlyCredits.used,
      monthlyCreditsLimit,
      monthlyCreditsRemaining,
    };

    return NextResponse.json({ stats });
  } catch (err) {
    return handleUserError(err, 'user/stats GET');
  }
}
