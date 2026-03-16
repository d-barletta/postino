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
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(limitParam, 1), 200);

    const logsSnap = await db
      .collection('emailLogs')
      .orderBy('receivedAt', 'desc')
      .limit(limit)
      .get();

    const usersSnap = await db.collection('users').get();
    const usersMap = new Map(
      usersSnap.docs.map((d) => [d.id, d.data().email as string])
    );

    const logs = logsSnap.docs.map((d) => {
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
      };
    });

    return NextResponse.json({ logs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
