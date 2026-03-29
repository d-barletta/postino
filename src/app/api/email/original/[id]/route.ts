import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;

    // Check ownership: must be the owner or an admin
    if (data.userId !== decoded.uid) {
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({
      id: logSnap.id,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      ccAddress: data.ccAddress ?? null,
      bccAddress: data.bccAddress ?? null,
      subject: data.subject,
      originalBody: data.originalBody ?? null,
      receivedAt: data.receivedAt?.toDate?.()?.toISOString() ?? null,
      attachmentCount: data.attachmentCount ?? 0,
      attachmentNames: data.attachmentNames ?? [],
      emailAnalysis: data.emailAnalysis ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching original email:', msg);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
