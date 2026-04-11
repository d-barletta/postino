import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

const VALID_STATUSES = new Set(['received', 'processing', 'forwarded', 'error', 'skipped']);
const DEFAULT_PAGE_SIZE = 20;
/** Max rows fetched before search/filter for in-memory queries. */
const SEARCH_FETCH_LIMIT = 1000;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const hasAttachments = searchParams.get('hasAttachments') === 'true';
    const statusParam = searchParams.get('status');
    const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(
      100,
      Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam),
    );

    const selectFields =
      'id, user_id, to_address, from_address, subject, received_at, processed_at, status, rule_applied, tokens_used, estimated_cost, error_message, agent_trace, attachment_count, attachment_names';

    let rows: Record<string, unknown>[];
    let totalCount: number | null = null;

    if (search || hasAttachments) {
      // Fetch a large batch and filter in memory
      let q = supabase
        .from('email_logs')
        .select(selectFields)
        .order('received_at', { ascending: false })
        .limit(SEARCH_FETCH_LIMIT);
      if (status) q = q.eq('status', status);
      const { data } = await q;
      rows = (data ?? []) as Record<string, unknown>[];
    } else {
      const offset = (page - 1) * pageSize;
      let q = supabase
        .from('email_logs')
        .select(selectFields, { count: 'exact' })
        .order('received_at', { ascending: false })
        .range(offset, offset + pageSize);
      if (status) q = q.eq('status', status);
      const { data, count } = await q;
      rows = (data ?? []) as Record<string, unknown>[];
      totalCount = count ?? null;
    }

    // Batch-fetch user emails for the rows we have
    const userIds = [...new Set(rows.map((r) => r.user_id as string).filter(Boolean))];
    const usersMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: userRows } = await supabase.from('users').select('id, email').in('id', userIds);
      for (const u of userRows ?? []) {
        usersMap.set(u.id as string, u.email as string);
      }
    }

    let docs = rows.map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      userEmail: usersMap.get(r.user_id as string) || null,
      toAddress: r.to_address,
      fromAddress: r.from_address,
      subject: r.subject,
      receivedAt: (r.received_at as string) ?? null,
      processedAt: (r.processed_at as string) ?? null,
      status: r.status,
      ruleApplied: r.rule_applied ?? null,
      tokensUsed: r.tokens_used ?? null,
      estimatedCost: r.estimated_cost ?? null,
      errorMessage: r.error_message ?? null,
      agentTrace: r.agent_trace ?? null,
      attachmentCount: (r.attachment_count as number) ?? 0,
      attachmentNames: (r.attachment_names as string[]) ?? [],
    }));

    if (search) {
      docs = docs.filter(
        (d) =>
          (d.subject as string)?.toLowerCase().includes(search) ||
          (d.fromAddress as string)?.toLowerCase().includes(search) ||
          (d.userEmail && (d.userEmail as string).toLowerCase().includes(search)) ||
          (d.toAddress as string)?.toLowerCase().includes(search),
      );
    }

    if (hasAttachments) {
      docs = docs.filter((d) => ((d.attachmentCount as number) ?? 0) > 0);
    }

    if (search || hasAttachments) {
      const total = docs.length;
      const start = (page - 1) * pageSize;
      const paginatedDocs = docs.slice(start, start + pageSize);
      const hasNextPage = start + pageSize < total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return NextResponse.json({
        logs: paginatedDocs,
        page,
        pageSize,
        hasNextPage,
        totalCount: total,
        totalPages,
      });
    } else {
      const hasNextPage = docs.length > pageSize;
      const paginatedDocs = docs.slice(0, pageSize);
      const totalPages = totalCount !== null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
      return NextResponse.json({
        logs: paginatedDocs,
        page,
        pageSize,
        hasNextPage,
        totalCount,
        totalPages,
      });
    }
  } catch (error) {
    return handleAdminError(error, 'admin/emails GET');
  }
}
