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

    const [usersSnap, logsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('emailLogs').get(),
    ]);

    const users = usersSnap.docs.map((d) => d.data());
    const logs = logsSnap.docs.map((d) => d.data());

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      totalEmailsReceived: logs.length,
      totalEmailsForwarded: logs.filter((l) => l.status === 'forwarded').length,
      totalEmailsError: logs.filter((l) => l.status === 'error').length,
      totalEmailsSkipped: logs.filter((l) => l.status === 'skipped').length,
      totalTokensUsed: logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0),
      totalEstimatedCost: logs.reduce((sum, l) => sum + (l.estimatedCost || 0), 0),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
