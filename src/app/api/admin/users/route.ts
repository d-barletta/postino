import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
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
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
