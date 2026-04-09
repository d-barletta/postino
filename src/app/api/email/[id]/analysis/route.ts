import { NextRequest, NextResponse } from 'next/server';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeStoredEmailLog } from '@/lib/email-analysis';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUserRequest(request);
    const { id } = await params;
    const db = adminDb();
    const logRef = db.collection('emailLogs').doc(id);
    const logSnap = await logRef.get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;

    if (data.userId !== decoded.uid) {
      const requesterSnap = await db.collection('users').doc(decoded.uid).get();
      if (!requesterSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (typeof data.originalBody !== 'string' || !data.originalBody.trim()) {
      return NextResponse.json({ error: 'Original email content unavailable' }, { status: 400 });
    }

    const ownerId = typeof data.userId === 'string' ? data.userId : '';
    const ownerSnap = ownerId ? await db.collection('users').doc(ownerId).get() : null;
    const analysisOutputLanguage =
      typeof ownerSnap?.data()?.analysisOutputLanguage === 'string'
        ? (ownerSnap.data()?.analysisOutputLanguage as string) || undefined
        : undefined;

    let safeAnalysis;
    try {
      safeAnalysis = await analyzeStoredEmailLog({
        fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
        subject: typeof data.subject === 'string' ? data.subject : '',
        originalBody: data.originalBody,
        analysisOutputLanguage,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Analysis unavailable') {
        return NextResponse.json({ error: 'Analysis unavailable' }, { status: 502 });
      }
      throw error;
    }

    await logRef.update({ emailAnalysis: safeAnalysis });

    return NextResponse.json({ analysis: safeAnalysis });
  } catch (error) {
    return handleUserError(error, 'email/[id]/analysis');
  }
}
