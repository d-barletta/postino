import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const { searchParams } = request.nextUrl;
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const search = searchParams.get('search')?.trim() || null;
    // `terms` supports multiple OR-matched search terms (e.g. for merged entities)
    const terms = searchParams
      .getAll('terms')
      .map((t) => t.trim())
      .filter(Boolean);
    const hasAttachments = searchParams.get('hasAttachments') === 'true' ? true : null;
    const sentimentFilter = searchParams.get('sentiment')?.trim() || null;
    const emailTypeFilter = searchParams.get('emailType')?.trim() || null;
    const priorityFilter = searchParams.get('priority')?.trim() || null;
    const senderTypeFilter = searchParams.get('senderType')?.trim() || null;
    const requiresResponse = searchParams.get('requiresResponse') === 'true' ? true : null;
    const hasActionItems = searchParams.get('hasActionItems') === 'true' ? true : null;
    const isUrgent = searchParams.get('isUrgent') === 'true' ? true : null;
    const languageFilter = searchParams.get('language')?.trim() || null;
    const statusFilter = searchParams.get('status')?.trim() || null;
    // entity filters – multi-value
    const peopleFilter = searchParams.getAll('people').map((v) => v.trim()).filter(Boolean);
    const orgsFilter = searchParams.getAll('orgs').map((v) => v.trim()).filter(Boolean);
    const placesFilter = searchParams.getAll('places').map((v) => v.trim()).filter(Boolean);
    const eventsFilter = searchParams.getAll('events').map((v) => v.trim()).filter(Boolean);
    const numbersFilter = searchParams.getAll('numbers').map((v) => v.trim()).filter(Boolean);
    const datesFilter = searchParams.getAll('dates').map((v) => v.trim()).filter(Boolean);
    const pricesFilter = searchParams.getAll('prices').map((v) => v.trim()).filter(Boolean);
    // cursor-based pagination
    const cursor = searchParams.get('cursor') || null;

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam),
    );

    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('search_email_logs', {
      p_user_id: user.id,
      p_search: search,
      p_terms: terms.length > 0 ? terms : null,
      p_status: statusFilter,
      p_sentiment: sentimentFilter,
      p_email_type: emailTypeFilter,
      p_priority: priorityFilter,
      p_sender_type: senderTypeFilter,
      p_language: languageFilter,
      p_requires_response: requiresResponse,
      p_has_action_items: hasActionItems,
      p_is_urgent: isUrgent,
      p_has_attachments: hasAttachments,
      p_people: peopleFilter.length > 0 ? peopleFilter : null,
      p_orgs: orgsFilter.length > 0 ? orgsFilter : null,
      p_places: placesFilter.length > 0 ? placesFilter : null,
      p_events: eventsFilter.length > 0 ? eventsFilter : null,
      p_numbers: numbersFilter.length > 0 ? numbersFilter : null,
      p_dates: datesFilter.length > 0 ? datesFilter : null,
      p_prices: pricesFilter.length > 0 ? pricesFilter : null,
      p_page: page,
      p_page_size: pageSize,
      p_cursor: cursor,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    // RPC returns row_to_json (snake_case); map to the camelCase shape the frontend expects.
    const rawLogs: Record<string, unknown>[] = Array.isArray(row?.logs)
      ? (row.logs as Record<string, unknown>[])
      : [];
    const logs = rawLogs.map((d) => ({
      id: d.id,
      toAddress: (d.to_address as string) || '',
      fromAddress: (d.from_address as string) || '',
      ccAddress: (d.cc_address as string | undefined) || undefined,
      bccAddress: (d.bcc_address as string | undefined) || undefined,
      subject: (d.subject as string) || '',
      receivedAt: (d.received_at as string) ?? null,
      processedAt: (d.processed_at as string) ?? null,
      status: d.status,
      ruleApplied: d.rule_applied,
      tokensUsed: d.tokens_used,
      estimatedCredits: d.estimated_credits,
      errorMessage: d.error_message,
      attachmentCount: (d.attachment_count as number) ?? 0,
      attachmentNames: (d.attachment_names as string[]) ?? [],
      userId: d.user_id,
      emailAnalysis: (d.email_analysis as Record<string, unknown> | null) ?? null,
      isRead: d.is_read !== false,
    }));
    const totalCount = Number(row?.total_count ?? 0);
    const hasNextPage = Boolean(row?.has_next_page);
    const nextCursor = row?.next_cursor ?? null;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return NextResponse.json({
      logs,
      page,
      pageSize,
      hasNextPage,
      nextCursor,
      totalCount,
      totalPages,
    });
  } catch (err) {
    return handleUserError(err, 'email/logs GET');
  }
}
