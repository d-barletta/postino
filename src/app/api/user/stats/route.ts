import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const db = adminDb();
    const snap = await db
      .collection('emailLogs')
      .where('userId', '==', decoded.uid)
      .get();

    const logs = snap.docs.map((d) => d.data());

    const stats = {
      totalEmailsReceived: logs.length,
      totalEmailsForwarded: logs.filter((l) => l.status === 'forwarded').length,
      totalEmailsError: logs.filter((l) => l.status === 'error').length,
      totalEmailsSkipped: logs.filter((l) => l.status === 'skipped').length,
      totalTokensUsed: logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0),
      totalEstimatedCost: logs.reduce((sum, l) => sum + (l.estimatedCost || 0), 0),
    };

    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
