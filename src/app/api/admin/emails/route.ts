import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';

const VALID_STATUSES = new Set(['received', 'processing', 'forwarded', 'error', 'skipped']);
const DEFAULT_PAGE_SIZE = 20;
/** Max docs fetched before search/filter for in-memory queries. */
const SEARCH_FETCH_LIMIT = 1000;

/** Maximum IDs allowed per Firestore 'in' query clause. */
const FIRESTORE_IN_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();

    const { searchParams } = new URL(request.url);
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const hasAttachments = searchParams.get('hasAttachments') === 'true';
    const statusParam = searchParams.get('status');
    const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
    const pageSize = Math.min(100, Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam));

    let baseQuery = db.collection('emailLogs') as FirebaseFirestore.Query;

    if (status) {
      // Avoid requiring a composite index on (status, receivedAt); results may
      // not be strictly ordered by receivedAt when filtering by status.
      baseQuery = baseQuery.where('status', '==', status);
    } else {
      baseQuery = baseQuery.orderBy('receivedAt', 'desc');
    }

    let snap;
    if (search || hasAttachments) {
      snap = await baseQuery.limit(SEARCH_FETCH_LIMIT).get();
    } else {
      const offset = (page - 1) * pageSize;
      snap = await baseQuery.offset(offset).limit(pageSize + 1).get();
    }

    // Collect only the unique user IDs referenced in the current result set and
    // batch-fetch their email addresses — avoids a full users collection scan.
    const userIds = [...new Set(snap.docs.map((d) => d.data().userId as string).filter(Boolean))];
    const usersMap = new Map<string, string>();
    if (userIds.length > 0) {
      const chunks: string[][] = [];
      for (let i = 0; i < userIds.length; i += FIRESTORE_IN_LIMIT) {
        chunks.push(userIds.slice(i, i + FIRESTORE_IN_LIMIT));
      }
      const chunkSnaps = await Promise.all(
        chunks.map((chunk) => db.collection('users').where(FieldPath.documentId(), 'in', chunk).get())
      );
      for (const chunkSnap of chunkSnaps) {
        for (const userDoc of chunkSnap.docs) {
          usersMap.set(userDoc.id, userDoc.data().email as string);
        }
      }
    }

    let docs = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        userEmail: usersMap.get(data.userId) || null,
        toAddress: data.toAddress,
        fromAddress: data.fromAddress,
        subject: data.subject,
        receivedAt: data.receivedAt?.toDate?.()?.toISOString() ?? null,
        processedAt: data.processedAt?.toDate?.()?.toISOString() ?? null,
        status: data.status,
        ruleApplied: data.ruleApplied ?? null,
        tokensUsed: data.tokensUsed ?? null,
        estimatedCost: data.estimatedCost ?? null,
        errorMessage: data.errorMessage ?? null,
        agentTrace: data.agentTrace ?? null,
        attachmentCount: (data.attachmentCount as number) ?? 0,
        attachmentNames: (data.attachmentNames as string[]) ?? [],
      };
    });

    if (search) {
      docs = docs.filter(
        (d) =>
          d.subject?.toLowerCase().includes(search) ||
          d.fromAddress?.toLowerCase().includes(search) ||
          (d.userEmail && d.userEmail.toLowerCase().includes(search)) ||
          d.toAddress?.toLowerCase().includes(search),
      );
    }

    if (hasAttachments) {
      docs = docs.filter((d) => (d.attachmentCount ?? 0) > 0);
    }

    if (search || hasAttachments) {
      const totalCount = docs.length;
      const start = (page - 1) * pageSize;
      const paginatedDocs = docs.slice(start, start + pageSize);
      const hasNextPage = start + pageSize < docs.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      return NextResponse.json({ logs: paginatedDocs, page, pageSize, hasNextPage, totalCount, totalPages });
    } else {
      const hasNextPage = docs.length > pageSize;
      const paginatedDocs = docs.slice(0, pageSize);
      // totalCount/totalPages are not available without an extra count query when
      // using offset-based Firestore pagination without search filters.
      return NextResponse.json({ logs: paginatedDocs, page, pageSize, hasNextPage, totalCount: null, totalPages: null });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}
