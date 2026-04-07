import { NextRequest, NextResponse } from 'next/server';
import { analyzeEmailContent } from '@/lib/agent';
import { isFirebaseAuthError, verifyUserRequest } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import type { EmailAnalysis } from '@/types';

function toFirestoreSafeAnalysis(analysis: EmailAnalysis): EmailAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as EmailAnalysis;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const originalBody = typeof data.originalBody === 'string' ? data.originalBody : '';
    if (!originalBody.trim()) {
      return NextResponse.json(
        { error: 'Original email content unavailable' },
        { status: 400 },
      );
    }

    const ownerId = typeof data.userId === 'string' ? data.userId : '';
    const ownerSnap = ownerId ? await db.collection('users').doc(ownerId).get() : null;
    const analysisOutputLanguage =
      typeof ownerSnap?.data()?.analysisOutputLanguage === 'string'
        ? ((ownerSnap.data()?.analysisOutputLanguage as string) || undefined)
        : undefined;

    const emailFrom = typeof data.fromAddress === 'string' ? data.fromAddress : '';
    const emailSubject = typeof data.subject === 'string' ? data.subject : '';
    const isHtml = /<[a-z][\s\S]*>/i.test(originalBody);

    const result = await analyzeEmailContent(
      emailFrom,
      emailSubject,
      originalBody,
      isHtml,
      undefined,
      analysisOutputLanguage,
    );

    if (!result.analysis) {
      return NextResponse.json({ error: 'Analysis unavailable' }, { status: 502 });
    }

    const safeAnalysis = toFirestoreSafeAnalysis(result.analysis);
    await logRef.update({ emailAnalysis: safeAnalysis });

    return NextResponse.json({ analysis: safeAnalysis });
  } catch (error) {
    if (isFirebaseAuthError(error) || (error instanceof Error && error.message === 'Forbidden')) {
      const status = error instanceof Error && error.message === 'Forbidden' ? 403 : 401;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unauthorized' },
        { status },
      );
    }

    console.error('[api/email/[id]/analysis] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
