import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAdminRequest } from '@/lib/api-auth';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const db = adminDb();
    const { searchParams } = new URL(request.url);

    const pageSizeParam = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, isNaN(pageSizeParam) ? DEFAULT_PAGE_SIZE : pageSizeParam));
    // cursor is the last document ID from the previous page
    const cursor = searchParams.get('cursor');

    let q = db.collection('users').orderBy('createdAt', 'desc').limit(pageSize + 1);
    if (cursor) {
      const cursorDoc = await db.collection('users').doc(cursor).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc) as typeof q;
      }
    }

    const snap = await q.get();
    const hasNextPage = snap.docs.length > pageSize;
    const pageDocs = hasNextPage ? snap.docs.slice(0, pageSize) : snap.docs;
    const nextCursor = hasNextPage ? pageDocs[pageDocs.length - 1].id : null;

    const users = pageDocs.map((d) => ({
      uid: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
    }));

    return NextResponse.json({ users, hasNextPage, nextCursor });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users] GET error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
