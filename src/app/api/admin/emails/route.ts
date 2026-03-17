import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '20', 10);
    const pageSize = Math.min(Math.max(pageSizeParam, 1), 100);
    const cursor = searchParams.get('cursor');

    let query = db
      .collection('emailLogs')
      .orderBy('receivedAt', 'desc')
      .limit(pageSize + 1);

    if (cursor) {
      const cursorDoc = await db.collection('emailLogs').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const logsSnap = await query.get();

    const hasMore = logsSnap.docs.length > pageSize;
    const docs = hasMore ? logsSnap.docs.slice(0, pageSize) : logsSnap.docs;
    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    const usersSnap = await db.collection('users').get();
    const usersMap = new Map(
      usersSnap.docs.map((d) => [d.id, d.data().email as string])
    );

    const logs = docs.map((d) => {
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
      };
    });

    return NextResponse.json({ logs, hasMore, nextCursor });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
