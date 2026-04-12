import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/**
 * Max docs fetched for full-text search queries.
 * Full-text search cannot be done server-side; we fetch a bounded set and filter in-memory.
 * Structured scalar filters are still pushed to the database first to reduce this set.
 */
const TEXT_SEARCH_FETCH_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const { searchParams } = request.nextUrl;
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    // `terms` supports multiple OR-matched search terms (e.g. for merged entities)
    const termsRaw = searchParams
      .getAll('terms')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const hasAttachments = searchParams.get('hasAttachments') === 'true';
    const sentimentFilter = (searchParams.get('sentiment') || '').trim().toLowerCase();
    const emailTypeFilter = (searchParams.get('emailType') || '').trim().toLowerCase();
    const priorityFilter = (searchParams.get('priority') || '').trim().toLowerCase();
    const senderTypeFilter = (searchParams.get('senderType') || '').trim().toLowerCase();
    const requiresResponse = searchParams.get('requiresResponse') === 'true';
    const hasActionItems = searchParams.get('hasActionItems') === 'true';
    const isUrgent = searchParams.get('isUrgent') === 'true';
    const languageFilter = (searchParams.get('language') || '').trim().toLowerCase();
    const statusFilter = (searchParams.get('status') || '').trim().toLowerCase();
    // entity filters – multi-value; preserve original case for matching.
    const peopleFilter = searchParams
      .getAll('people')
      .map((v) => v.trim())
      .filter(Boolean);
    const orgsFilter = searchParams
      .getAll('orgs')
      .map((v) => v.trim())
      .filter(Boolean);
    const placesFilter = searchParams
      .getAll('places')
      .map((v) => v.trim())
      .filter(Boolean);
    const eventsFilter = searchParams
      .getAll('events')
      .map((v) => v.trim())
      .filter(Boolean);
    const numbersFilter = searchParams
      .getAll('numbers')
      .map((v) => v.trim())
      .filter(Boolean);
    const datesFilter = searchParams
      .getAll('dates')
      .map((v) => v.trim())
      .filter(Boolean);
    const pricesFilter = searchParams
      .getAll('prices')
      .map((v) => v.trim())
      .filter(Boolean);
    // cursor-based pagination: pass the last document ID from the previous page
    const cursor = searchParams.get('cursor');

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam),
    );

    const supabase = createAdminClient();

    const hasTextSearch = !!(search || termsRaw.length > 0);

    // Array filters are all handled in-memory (no server-side JSONB array-contains push).
    const hasArrayFilters = !!(
      peopleFilter.length > 0 ||
      orgsFilter.length > 0 ||
      placesFilter.length > 0 ||
      eventsFilter.length > 0 ||
      numbersFilter.length > 0 ||
      datesFilter.length > 0 ||
      pricesFilter.length > 0
    );

    // ---------------------------------------------------------------------------
    // Build Supabase query – push scalar/boolean structured filters to the database.
    // Array filters (entities) and full-text search are applied in-memory.
    // ---------------------------------------------------------------------------
    const structuredFiltersActive = !!(
      statusFilter ||
      sentimentFilter ||
      emailTypeFilter ||
      priorityFilter ||
      senderTypeFilter ||
      languageFilter ||
      requiresResponse ||
      hasActionItems ||
      isUrgent ||
      hasArrayFilters
    );

    let supabaseQuery: any = supabase
      .from('email_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('received_at', { ascending: false });

    if (statusFilter) supabaseQuery = supabaseQuery.eq('status', statusFilter);
    if (sentimentFilter)
      supabaseQuery = supabaseQuery.filter('email_analysis->>sentiment', 'eq', sentimentFilter);
    if (emailTypeFilter)
      supabaseQuery = supabaseQuery.filter('email_analysis->>emailType', 'eq', emailTypeFilter);
    if (priorityFilter)
      supabaseQuery = supabaseQuery.filter('email_analysis->>priority', 'eq', priorityFilter);
    if (senderTypeFilter)
      supabaseQuery = supabaseQuery.filter('email_analysis->>senderType', 'eq', senderTypeFilter);
    if (languageFilter)
      supabaseQuery = supabaseQuery.filter('email_analysis->>language', 'eq', languageFilter);
    if (requiresResponse)
      supabaseQuery = supabaseQuery.filter('email_analysis->requiresResponse', 'eq', 'true');
    if (hasActionItems)
      supabaseQuery = supabaseQuery.filter('email_analysis->hasActionItems', 'eq', 'true');
    if (isUrgent) supabaseQuery = supabaseQuery.filter('email_analysis->isUrgent', 'eq', 'true');

    // ---------------------------------------------------------------------------
    // Execute query
    // ---------------------------------------------------------------------------
    let rows: Record<string, unknown>[] = [];
    let totalCountFromDB: number | undefined;

    if (hasTextSearch || hasAttachments || hasArrayFilters) {
      // Full-text search, attachment filter, or array filters: push scalar filters to DB,
      // fetch up to TEXT_SEARCH_FETCH_LIMIT docs for in-memory filtering.
      const { data } = await supabaseQuery.limit(TEXT_SEARCH_FETCH_LIMIT);
      rows = data ?? [];
    } else if (structuredFiltersActive) {
      // Scalar filters only: fetch a large batch with count for in-memory pagination.
      const { data, count } = await supabaseQuery
        .select('*', { count: 'exact' })
        .limit(TEXT_SEARCH_FETCH_LIMIT);
      rows = data ?? [];
      totalCountFromDB = count ?? undefined;
    } else if (cursor) {
      // No filters, cursor provided for keyset pagination.
      const { data: cursorRow } = await supabase
        .from('email_logs')
        .select('received_at')
        .eq('id', cursor)
        .single();
      if (cursorRow) {
        const { data } = await supabaseQuery
          .lt('received_at', cursorRow.received_at)
          .limit(pageSize + 1);
        rows = data ?? [];
      } else {
        const { data } = await supabaseQuery.limit(pageSize + 1);
        rows = data ?? [];
      }
    } else {
      // No filters, no cursor: offset pagination.
      const offset = (page - 1) * pageSize;
      const { data } = await supabaseQuery.range(offset, offset + pageSize);
      rows = data ?? [];
    }

    let docs = rows.map((d) => ({
      id: d.id as string,
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
      estimatedCost: d.estimated_cost,
      errorMessage: d.error_message,
      attachmentCount: (d.attachment_count as number) ?? 0,
      attachmentNames: (d.attachment_names as string[]) ?? [],
      userId: d.user_id,
      emailAnalysis: (d.email_analysis as Record<string, unknown> | null) ?? null,
    }));

    // ---------------------------------------------------------------------------
    // In-memory filters
    // ---------------------------------------------------------------------------

    /** Returns true if the given doc matches the provided single search term. */
    function matchesTerm(d: (typeof docs)[number], term: string): boolean {
      if (
        d.subject.toLowerCase().includes(term) ||
        d.fromAddress.toLowerCase().includes(term) ||
        (d.toAddress && d.toAddress.toLowerCase().includes(term)) ||
        (d.emailAnalysis?.summary &&
          String(d.emailAnalysis.summary).toLowerCase().includes(term)) ||
        (d.emailAnalysis?.intent && String(d.emailAnalysis.intent).toLowerCase().includes(term)) ||
        (Array.isArray(d.emailAnalysis?.topics) &&
          d.emailAnalysis.topics.some(
            (topic: unknown) => typeof topic === 'string' && topic.toLowerCase().includes(term),
          ))
      )
        return true;
      const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
      if (entities) {
        const placeNames = extractStoredPlaceNames(entities.places, entities.placeNames);
        if (placeNames.some((place) => place.toLowerCase().includes(term))) return true;

        for (const list of Object.values(entities)) {
          if (
            Array.isArray(list) &&
            list.some((v) => typeof v === 'string' && v.toLowerCase().includes(term))
          )
            return true;
        }
      }
      return false;
    }

    if (search) {
      docs = docs.filter((d) => matchesTerm(d, search));
    }

    // OR-match across multiple terms (used for merged entity search).
    if (termsRaw.length > 0) {
      docs = docs.filter((d) => termsRaw.some((term) => matchesTerm(d, term)));
    }

    // hasAttachments: applied in-memory.
    if (hasAttachments) {
      docs = docs.filter((d) => (d.attachmentCount ?? 0) > 0);
    }

    // Array filters — all applied in-memory.
    if (peopleFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = entities?.people;
        return (
          Array.isArray(list) &&
          peopleFilter.some((p) =>
            list.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === p.toLowerCase()),
          )
        );
      });
    }

    if (orgsFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = entities?.organizations;
        return (
          Array.isArray(list) &&
          orgsFilter.some((o) =>
            list.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === o.toLowerCase()),
          )
        );
      });
    }

    if (placesFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = extractStoredPlaceNames(entities?.places, entities?.placeNames);
        return (
          list.length > 0 &&
          placesFilter.some((p) => list.some((v) => v.toLowerCase() === p.toLowerCase()))
        );
      });
    }

    if (eventsFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = entities?.events;
        return (
          Array.isArray(list) &&
          eventsFilter.some((e) =>
            list.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === e.toLowerCase()),
          )
        );
      });
    }

    if (numbersFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = entities?.numbers;
        return (
          Array.isArray(list) &&
          numbersFilter.some((n) =>
            list.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === n.toLowerCase()),
          )
        );
      });
    }

    if (datesFilter.length > 0) {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = entities?.dates;
        return (
          Array.isArray(list) &&
          datesFilter.some((dt) =>
            list.some(
              (v: unknown) => typeof v === 'string' && v.toLowerCase() === dt.toLowerCase(),
            ),
          )
        );
      });
    }

    if (pricesFilter.length > 0) {
      docs = docs.filter((d) => {
        const list = d.emailAnalysis?.prices;
        return (
          Array.isArray(list) &&
          pricesFilter.some((p) =>
            list.some((v: unknown) => typeof v === 'string' && v.toLowerCase() === p.toLowerCase()),
          )
        );
      });
    }

    // ---------------------------------------------------------------------------
    // Pagination & response
    // ---------------------------------------------------------------------------

    if (hasTextSearch || hasAttachments || hasArrayFilters) {
      // In-memory post-filter: compute pagination from the full filtered result set.
      const totalCount = docs.length;
      const start = (page - 1) * pageSize;
      const paginatedDocs = docs.slice(start, start + pageSize);
      const hasNextPage = start + pageSize < docs.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      return NextResponse.json({
        logs: paginatedDocs,
        page,
        pageSize,
        hasNextPage,
        totalCount,
        totalPages,
      });
    } else if (structuredFiltersActive) {
      // In-memory pagination over the batch fetched above.
      const total = docs.length;
      const start = (page - 1) * pageSize;
      const paginatedDocs = docs.slice(start, start + pageSize);
      const hasNextPage = start + pageSize < total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      // If we hit the fetch limit, the in-memory count is a lower bound; prefer the DB
      // count aggregation in that case. Otherwise the in-memory count is exact.
      const totalCount = total >= TEXT_SEARCH_FETCH_LIMIT ? (totalCountFromDB ?? total) : total;
      return NextResponse.json({
        logs: paginatedDocs,
        page,
        pageSize,
        hasNextPage,
        totalCount,
        totalPages,
      });
    } else {
      // No filters: cursor-based pagination.
      const hasNextPage = docs.length > pageSize;
      const paginatedDocs = docs.slice(0, pageSize);
      const nextCursor =
        hasNextPage && paginatedDocs.length > 0 ? paginatedDocs[paginatedDocs.length - 1].id : null;
      return NextResponse.json({
        logs: paginatedDocs,
        page,
        pageSize,
        hasNextPage,
        nextCursor,
      });
    }
  } catch (err) {
    return handleUserError(err, 'email/logs GET');
  }
}
