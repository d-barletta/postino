import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeStoredEmailLogWithDebug } from '@/lib/email-analysis';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: logRow } = await supabase
      .from('email_logs')
      .select('user_id, from_address, subject, original_body')
      .eq('id', id)
      .single();

    if (!logRow) {
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

    const userId = typeof logRow.user_id === 'string' ? logRow.user_id : '';
    const { data: userRow } = userId
      ? await supabase
          .from('users')
          .select('analysis_output_language, email')
          .eq('id', userId)
          .single()
      : { data: null };

    const analysisOutputLanguage =
      typeof userRow?.analysis_output_language === 'string'
        ? (userRow.analysis_output_language as string) || undefined
        : undefined;

    const result = await analyzeStoredEmailLogWithDebug({
      fromAddress: typeof logRow.from_address === 'string' ? logRow.from_address : '',
      subject: typeof logRow.subject === 'string' ? logRow.subject : '',
      originalBody: typeof logRow.original_body === 'string' ? logRow.original_body : '',
      analysisOutputLanguage,
      modelOverride,
      openRouterUserId: typeof userRow?.email === 'string' ? userRow.email : '',
      openRouterSessionId: id,
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
