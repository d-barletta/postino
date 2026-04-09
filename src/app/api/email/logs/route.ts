import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import type { Query } from 'firebase-admin/firestore';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';
import { extractStoredPlaceNames } from '@/lib/place-utils';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/**
 * Max docs fetched for full-text search queries.
 * Full-text search cannot be done in Firestore; we fetch a bounded set and filter in-memory.
 * Structured filters are still pushed to Firestore first to reduce this set.
 */
const TEXT_SEARCH_FETCH_LIMIT = 500;
/** Firestore array-contains-any supports at most 30 values. */
const ARRAY_CONTAINS_ANY_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

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
    // tags – multi-value; preserve original case so Firestore array-contains-any can match stored values exactly.
    const tagsFilter = searchParams
      .getAll('tags')
      .map((t) => t.trim())
      .filter(Boolean);
    const statusFilter = (searchParams.get('status') || '').trim().toLowerCase();
    // entity filters – multi-value; preserve original case for Firestore array-contains-any matching.
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
    // cursor-based pagination: pass the last document ID from the previous page
    const cursor = searchParams.get('cursor');

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam),
    );

    const db = adminDb();

    const hasTextSearch = !!(search || termsRaw.length > 0);

    // Track which array filter was pushed to Firestore.
    // Firestore allows only ONE array-contains / array-contains-any per query.
    let pushedArrayField: 'tags' | 'people' | 'orgs' | 'places' | 'events' | 'numbers' | null = null;

    // ---------------------------------------------------------------------------
    // Build Firestore query – push all structured filters to the database.
    // Structured filters include equality fields, boolean flags, and array filters.
    // The only filters that cannot be pushed are:
    //   • Full-text search (subject/body/summary) – no native Firestore support.
    //   • hasAttachments (inequality on attachmentCount) – would require a changed sort order.
    //   • Secondary array filters when multiple array filters are active (Firestore limit: 1).
    // ---------------------------------------------------------------------------
    let firestoreQuery: Query = db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .orderBy('receivedAt', 'desc');

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
      tagsFilter.length > 0 ||
      peopleFilter.length > 0 ||
      orgsFilter.length > 0 ||
      placesFilter.length > 0 ||
      eventsFilter.length > 0 ||
      numbersFilter.length > 0
    );

    if (structuredFiltersActive) {
      // Equality / boolean filters — pushed directly to Firestore.
      if (statusFilter) firestoreQuery = firestoreQuery.where('status', '==', statusFilter);
      if (sentimentFilter)
        firestoreQuery = firestoreQuery.where('emailAnalysis.sentiment', '==', sentimentFilter);
      if (emailTypeFilter)
        firestoreQuery = firestoreQuery.where('emailAnalysis.emailType', '==', emailTypeFilter);
      if (priorityFilter)
        firestoreQuery = firestoreQuery.where('emailAnalysis.priority', '==', priorityFilter);
      if (senderTypeFilter)
        firestoreQuery = firestoreQuery.where('emailAnalysis.senderType', '==', senderTypeFilter);
      if (languageFilter)
        firestoreQuery = firestoreQuery.where('emailAnalysis.language', '==', languageFilter);
      if (requiresResponse)
        firestoreQuery = firestoreQuery.where('emailAnalysis.requiresResponse', '==', true);
      if (hasActionItems)
        firestoreQuery = firestoreQuery.where('emailAnalysis.hasActionItems', '==', true);
      if (isUrgent) firestoreQuery = firestoreQuery.where('emailAnalysis.isUrgent', '==', true);

      // Array filters — push the first active one via array-contains-any; apply remaining in-memory.
      if (tagsFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.tags',
          'array-contains-any',
          tagsFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'tags';
      } else if (peopleFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.entities.people',
          'array-contains-any',
          peopleFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'people';
      } else if (orgsFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.entities.organizations',
          'array-contains-any',
          orgsFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'orgs';
      } else if (placesFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.entities.placeNames',
          'array-contains-any',
          placesFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'places';
      } else if (eventsFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.entities.events',
          'array-contains-any',
          eventsFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'events';
      } else if (numbersFilter.length > 0) {
        firestoreQuery = firestoreQuery.where(
          'emailAnalysis.entities.numbers',
          'array-contains-any',
          numbersFilter.slice(0, ARRAY_CONTAINS_ANY_LIMIT),
        );
        pushedArrayField = 'numbers';
      }
    }

    // ---------------------------------------------------------------------------
    // Execute Firestore query
    // ---------------------------------------------------------------------------
    let snap;
    let totalCountFromFirestore: number | undefined;

    if (hasTextSearch || hasAttachments) {
      // Full-text search or attachment filter: Firestore structured filters already applied above
      // to narrow the result set; fetch up to TEXT_SEARCH_FETCH_LIMIT docs for in-memory filtering.
      snap = await firestoreQuery.limit(TEXT_SEARCH_FETCH_LIMIT).get();
    } else if (structuredFiltersActive) {
      // Fetch a large batch with the structured Firestore filters already applied, then
      // paginate in-memory. Using .offset().limit() with array-contains-any can silently return
      // zero docs even when a count() on the same query returns results, so we avoid offset here.
      const [batchSnap, countSnap] = await Promise.all([
        firestoreQuery.limit(TEXT_SEARCH_FETCH_LIMIT).get(),
        firestoreQuery
          .count()
          .get()
          .catch(() => null),
      ]);
      snap = batchSnap;
      totalCountFromFirestore = countSnap?.data().count ?? undefined;
    } else if (cursor) {
      // No filters, cursor provided for pagination.
      const cursorDoc = await db.collection('emailLogs').doc(cursor).get();
      if (cursorDoc.exists) {
        snap = await firestoreQuery
          .startAfter(cursorDoc)
          .limit(pageSize + 1)
          .get();
      } else {
        snap = await firestoreQuery.limit(pageSize + 1).get();
      }
    } else {
      // No filters, no cursor: offset pagination.
      const offset = (page - 1) * pageSize;
      snap = await firestoreQuery
        .offset(offset)
        .limit(pageSize + 1)
        .get();
    }

    let docs = snap.docs.map((d) => ({
      id: d.id,
      toAddress: (d.data().toAddress as string) || '',
      fromAddress: (d.data().fromAddress as string) || '',
      ccAddress: (d.data().ccAddress as string | undefined) || undefined,
      bccAddress: (d.data().bccAddress as string | undefined) || undefined,
      subject: (d.data().subject as string) || '',
      receivedAt: d.data().receivedAt?.toDate?.()?.toISOString() ?? null,
      processedAt: d.data().processedAt?.toDate?.()?.toISOString() ?? null,
      status: d.data().status,
      ruleApplied: d.data().ruleApplied,
      tokensUsed: d.data().tokensUsed,
      estimatedCost: d.data().estimatedCost,
      errorMessage: d.data().errorMessage,
      attachmentCount: (d.data().attachmentCount as number) ?? 0,
      attachmentNames: (d.data().attachmentNames as string[]) ?? [],
      userId: d.data().userId,
      emailAnalysis: d.data().emailAnalysis ?? null,
    }));

    // ---------------------------------------------------------------------------
    // In-memory filters — only for capabilities Firestore cannot handle natively.
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
        (Array.isArray(d.emailAnalysis?.tags) &&
          d.emailAnalysis.tags.some(
            (tag: unknown) => typeof tag === 'string' && tag.toLowerCase().includes(term),
          )) ||
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

    // hasAttachments: inequality on attachmentCount would change the sort order in Firestore,
    // so it is applied in-memory after the Firestore query.
    if (hasAttachments) {
      docs = docs.filter((d) => (d.attachmentCount ?? 0) > 0);
    }

    // Secondary array filters — applied in-memory when more than one array filter is active
    // (Firestore only supports one array-contains-any per query).
    if (tagsFilter.length > 0 && pushedArrayField !== 'tags') {
      docs = docs.filter((d) =>
        tagsFilter.some(
          (tag) =>
            Array.isArray(d.emailAnalysis?.tags) &&
            d.emailAnalysis.tags.some(
              (t: unknown) => typeof t === 'string' && t.toLowerCase() === tag.toLowerCase(),
            ),
        ),
      );
    }

    if (peopleFilter.length > 0 && pushedArrayField !== 'people') {
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

    if (orgsFilter.length > 0 && pushedArrayField !== 'orgs') {
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

    if (placesFilter.length > 0 && pushedArrayField !== 'places') {
      docs = docs.filter((d) => {
        const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
        const list = extractStoredPlaceNames(entities?.places, entities?.placeNames);
        return (
          list.length > 0 &&
          placesFilter.some((p) => list.some((v) => v.toLowerCase() === p.toLowerCase()))
        );
      });
    }

    if (eventsFilter.length > 0 && pushedArrayField !== 'events') {
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

    if (numbersFilter.length > 0 && pushedArrayField !== 'numbers') {
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

    // ---------------------------------------------------------------------------
    // Pagination & response
    // ---------------------------------------------------------------------------

    if (hasTextSearch || hasAttachments) {
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
      // If we hit the fetch limit, the in-memory count is a lower bound; prefer the Firestore
      // count aggregation in that case. Otherwise the in-memory count is exact.
      const totalCount =
        total >= TEXT_SEARCH_FETCH_LIMIT ? (totalCountFromFirestore ?? total) : total;
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
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[email/logs] error:', err);
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 });
  }
}
