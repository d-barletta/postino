import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

type StatsPeriod = '24h' | '7d' | '30d' | 'all';
const VALID_PERIODS = new Set<StatsPeriod>(['24h', '7d', '30d', 'all']);

const PERIOD_MS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period') ?? 'all';
    const period: StatsPeriod = VALID_PERIODS.has(periodParam as StatsPeriod)
      ? (periodParam as StatsPeriod)
      : 'all';

    const from = period !== 'all' ? new Date(Date.now() - PERIOD_MS[period]) : null;

    const buildBaseCount = (): any => {
      let q = supabase.from('email_logs').select('*', { count: 'exact', head: true });
      if (from) q = q.gte('received_at', from.toISOString());
      return q;
    };

    const buildBaseAgg = (): any => {
      let q = supabase
        .from('email_logs')
        .select('total_tokens:tokens_used.sum(), total_cost:estimated_cost.sum()');
      if (from) q = q.gte('received_at', from.toISOString());
      return q;
    };

    // Use server-side aggregation queries to avoid reading every document.
    // totalUsers and activeUsers are always all-time counts (not filtered by period).
    const [
      totalUsersResult,
      activeUsersResult,
      totalEmailsResult,
      forwardedResult,
      errorResult,
      skippedResult,
      emailAggResult,
      memoryAggResult,
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
      buildBaseCount(),
      buildBaseCount().eq('status', 'forwarded'),
      buildBaseCount().eq('status', 'error'),
      buildBaseCount().eq('status', 'skipped'),
      buildBaseAgg(),
      // Memory chat token usage is stored on the user row (lifetime running total).
      supabase
        .from('users')
        .select(
          'total_memory_tokens:memory_tokens_used.sum(), total_memory_cost:memory_estimated_cost.sum()',
        ),
    ]);

    if (emailAggResult.error) {
      console.error('[admin/stats] email_logs aggregate failed:', emailAggResult.error);
      throw emailAggResult.error;
    }
    if (memoryAggResult.error) {
      console.error('[admin/stats] users memory aggregate failed:', memoryAggResult.error);
      throw memoryAggResult.error;
    }

    const aggData = emailAggResult.data?.[0] as
      | { total_tokens: number | null; total_cost: number | null }
      | undefined;
    const memoryAggData = memoryAggResult.data?.[0] as
      | { total_memory_tokens: number | null; total_memory_cost: number | null }
      | undefined;

    const stats = {
      totalUsers: totalUsersResult.count ?? 0,
      activeUsers: activeUsersResult.count ?? 0,
      totalEmailsReceived: totalEmailsResult.count ?? 0,
      totalEmailsForwarded: forwardedResult.count ?? 0,
      totalEmailsError: errorResult.count ?? 0,
      totalEmailsSkipped: skippedResult.count ?? 0,
      totalTokensUsed: (aggData?.total_tokens ?? 0) + (memoryAggData?.total_memory_tokens ?? 0),
      totalEstimatedCost: (aggData?.total_cost ?? 0) + (memoryAggData?.total_memory_cost ?? 0),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    return handleAdminError(error, 'admin/stats GET');
  }
}
