import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

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
      let q = supabase
        .from('email_logs')
        .select('total_tokens:tokens_used.sum(), total_cost:estimated_cost.sum()')
        .eq('user_id', user.id);
      if (from) q = q.gte('received_at', from.toISOString());
      return q;
    };

    const [totalResult, forwardedResult, errorResult, skippedResult, aggResult, userResult] =
      await Promise.all([
        buildBaseCount(),
        buildBaseCount().eq('status', 'forwarded'),
        buildBaseCount().eq('status', 'error'),
        buildBaseCount().eq('status', 'skipped'),
        buildBaseAgg(),
        period === 'all'
          ? supabase
              .from('users')
              .select('memory_tokens_used, memory_estimated_cost')
              .eq('id', user.id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

    const aggData = aggResult.data?.[0] as
      | { total_tokens: number | null; total_cost: number | null }
      | undefined;
    const userData = userResult.data as {
      memory_tokens_used: number | null;
      memory_estimated_cost: number | null;
    } | null;

    const memoryTokensUsed =
      typeof userData?.memory_tokens_used === 'number' ? userData.memory_tokens_used : 0;
    const memoryEstimatedCost =
      typeof userData?.memory_estimated_cost === 'number' ? userData.memory_estimated_cost : 0;

    const stats = {
      totalEmailsReceived: totalResult.count ?? 0,
      totalEmailsForwarded: forwardedResult.count ?? 0,
      totalEmailsError: errorResult.count ?? 0,
      totalEmailsSkipped: skippedResult.count ?? 0,
      // Memory chat token usage (only included in 'all' period since it is not time-bucketed).
      totalTokensUsed: (aggData?.total_tokens ?? 0) + memoryTokensUsed,
      totalEstimatedCost: (aggData?.total_cost ?? 0) + memoryEstimatedCost,
    };

    return NextResponse.json({ stats });
  } catch (err) {
    return handleUserError(err, 'user/stats GET');
  }
}
