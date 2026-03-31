import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Query } from 'firebase-admin/firestore';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
/** Max docs fetched before search filtering for text-search queries. */
const SEARCH_FETCH_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const { searchParams } = request.nextUrl;
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    // `terms` supports multiple OR-matched search terms (e.g. for merged entities)
    const termsRaw = searchParams.getAll('terms').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const hasAttachments = searchParams.get('hasAttachments') === 'true';
    const sentimentFilter = (searchParams.get('sentiment') || '').trim().toLowerCase();
    const emailTypeFilter = (searchParams.get('emailType') || '').trim().toLowerCase();
    const priorityFilter = (searchParams.get('priority') || '').trim().toLowerCase();
    const senderTypeFilter = (searchParams.get('senderType') || '').trim().toLowerCase();
    const requiresResponse = searchParams.get('requiresResponse') === 'true';
    const hasActionItems = searchParams.get('hasActionItems') === 'true';
    const isUrgent = searchParams.get('isUrgent') === 'true';
    const languageFilter = (searchParams.get('language') || '').trim().toLowerCase();
    const tagsFilter = (searchParams.get('tags') || '').trim().toLowerCase();
    const statusFilter = (searchParams.get('status') || '').trim().toLowerCase();

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam));

    const db = adminDb();
    const query: Query = db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .orderBy('receivedAt', 'desc');

    let snap;
    const hasAnyFilter = search || termsRaw.length > 0 || hasAttachments || sentimentFilter || emailTypeFilter || priorityFilter || senderTypeFilter || requiresResponse || hasActionItems || isUrgent || languageFilter || tagsFilter || statusFilter;
    if (hasAnyFilter) {
      snap = await query.limit(SEARCH_FETCH_LIMIT).get();
    } else {
      const offset = (page - 1) * pageSize;
      snap = await query.offset(offset).limit(pageSize + 1).get();
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

    /** Returns true if the given doc matches the provided single search term. */
    function matchesTerm(d: (typeof docs)[number], term: string): boolean {
      if (
        d.subject.toLowerCase().includes(term) ||
        d.fromAddress.toLowerCase().includes(term) ||
        (d.toAddress && d.toAddress.toLowerCase().includes(term)) ||
        (d.emailAnalysis?.summary && String(d.emailAnalysis.summary).toLowerCase().includes(term)) ||
        (d.emailAnalysis?.intent && String(d.emailAnalysis.intent).toLowerCase().includes(term)) ||
        (Array.isArray(d.emailAnalysis?.tags) && d.emailAnalysis.tags.some((tag: unknown) => typeof tag === 'string' && tag.toLowerCase().includes(term))) ||
        (Array.isArray(d.emailAnalysis?.topics) && d.emailAnalysis.topics.some((topic: unknown) => typeof topic === 'string' && topic.toLowerCase().includes(term)))
      ) return true;
      const entities = d.emailAnalysis?.entities as Record<string, unknown> | undefined;
      if (entities) {
        for (const list of Object.values(entities)) {
          if (Array.isArray(list) && list.some((v) => typeof v === 'string' && v.toLowerCase().includes(term))) return true;
        }
      }
      return false;
    }

    if (search) {
      docs = docs.filter((d) => matchesTerm(d, search));
    }

    // OR-match across multiple terms (used for merged entity search)
    if (termsRaw.length > 0) {
      docs = docs.filter((d) => termsRaw.some((term) => matchesTerm(d, term)));
    }

    if (hasAttachments) {
      docs = docs.filter((d) => (d.attachmentCount ?? 0) > 0);
    }

    if (statusFilter) {
      docs = docs.filter((d) => d.status === statusFilter);
    }

    if (sentimentFilter) {
      docs = docs.filter((d) => d.emailAnalysis?.sentiment === sentimentFilter);
    }

    if (emailTypeFilter) {
      docs = docs.filter((d) => d.emailAnalysis?.emailType === emailTypeFilter);
    }

    if (priorityFilter) {
      docs = docs.filter((d) => d.emailAnalysis?.priority === priorityFilter);
    }

    if (senderTypeFilter) {
      docs = docs.filter((d) => d.emailAnalysis?.senderType === senderTypeFilter);
    }

    if (requiresResponse) {
      docs = docs.filter((d) => d.emailAnalysis?.requiresResponse === true);
    }

    if (hasActionItems) {
      docs = docs.filter((d) => d.emailAnalysis?.hasActionItems === true);
    }

    if (isUrgent) {
      docs = docs.filter((d) => d.emailAnalysis?.isUrgent === true);
    }

    if (languageFilter) {
      docs = docs.filter((d) => d.emailAnalysis?.language?.toLowerCase() === languageFilter);
    }

    if (tagsFilter) {
      docs = docs.filter((d) =>
        Array.isArray(d.emailAnalysis?.tags) &&
        d.emailAnalysis.tags.some((tag: unknown) => typeof tag === 'string' && tag.toLowerCase().includes(tagsFilter))
      );
    }

    let hasNextPage = false;
    let paginatedDocs;
    if (hasAnyFilter) {
      const totalCount = docs.length;
      const start = (page - 1) * pageSize;
      paginatedDocs = docs.slice(start, start + pageSize);
      hasNextPage = start + pageSize < docs.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      return NextResponse.json({ logs: paginatedDocs, page, pageSize, hasNextPage, totalCount, totalPages });
    } else {
      hasNextPage = docs.length > pageSize;
      paginatedDocs = docs.slice(0, pageSize);
      return NextResponse.json({ logs: paginatedDocs, page, pageSize, hasNextPage });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
