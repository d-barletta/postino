import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeStoredEmailLogWithDebug } from '@/lib/email-analysis';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let modelOverride: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.model === 'string' && body.model.trim()) {
        modelOverride = body.model.trim();
      }
    } catch {
      // No body or invalid JSON — proceed without model override.
    }

    const data = logSnap.data()!;
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const userSnap = userId ? await db.collection('users').doc(userId).get() : null;
    const analysisOutputLanguage =
      typeof userSnap?.data()?.analysisOutputLanguage === 'string'
        ? (userSnap.data()?.analysisOutputLanguage as string) || undefined
        : undefined;

    const result = await analyzeStoredEmailLogWithDebug({
      fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
      subject: typeof data.subject === 'string' ? data.subject : '',
      originalBody: typeof data.originalBody === 'string' ? data.originalBody : '',
      analysisOutputLanguage,
      modelOverride,
    });

    if (!result.analysis) {
      return NextResponse.json(
        {
          error: 'Analysis unavailable',
          extractedBody: result.extractedBody,
          tokensUsed: result.tokensUsed,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          model: result.model,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleAdminError(error, 'admin/email/[id]/analysis POST');
  }
}
