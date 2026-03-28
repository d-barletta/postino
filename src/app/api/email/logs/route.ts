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
    const hasAttachments = searchParams.get('hasAttachments') === 'true';

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam));

    const db = adminDb();
    let query: Query = db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .orderBy('receivedAt', 'desc');

    if (hasAttachments) {
      query = query.where('attachmentCount', '>', 0);
    }

    let snap;
    if (search) {
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
    }));

    if (search) {
      docs = docs.filter(
        (d) =>
          d.subject.toLowerCase().includes(search) ||
          d.fromAddress.toLowerCase().includes(search) ||
          (d.toAddress && d.toAddress.toLowerCase().includes(search))
      );
    }

    let hasNextPage = false;
    let paginatedDocs;
    if (search) {
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
