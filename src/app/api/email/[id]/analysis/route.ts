import { NextRequest, NextResponse } from 'next/server';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeStoredEmailLog } from '@/lib/email-analysis';
import { saveToSupermemory, buildMemoryEntryFromAnalysis } from '@/agents/email-agent';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('email_logs').select('*').eq('id', id).single();

    if (!data || error) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (data.user_id !== user.id) {
      const { data: requesterData } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      if (!requesterData?.is_admin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (typeof data.original_body !== 'string' || !data.original_body.trim()) {
      return NextResponse.json({ error: 'Original email content unavailable' }, { status: 400 });
    }

    const ownerId = typeof data.user_id === 'string' ? data.user_id : '';
    let analysisOutputLanguage: string | undefined;
    if (ownerId) {
      const { data: ownerData } = await supabase
        .from('users')
        .select('analysis_output_language')
        .eq('id', ownerId)
        .single();
      analysisOutputLanguage =
        typeof ownerData?.analysis_output_language === 'string'
          ? ownerData.analysis_output_language || undefined
          : undefined;
    }

    let safeAnalysis;
    try {
      safeAnalysis = await analyzeStoredEmailLog({
        fromAddress: typeof data.from_address === 'string' ? data.from_address : '',
        subject: typeof data.subject === 'string' ? data.subject : '',
        originalBody: data.original_body,
        analysisOutputLanguage,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Analysis unavailable') {
        return NextResponse.json({ error: 'Analysis unavailable' }, { status: 502 });
      }
      throw error;
    }

    await supabase
      .from('email_logs')
      .update({ email_analysis: safeAnalysis as unknown as import('@/types/supabase').Json })
      .eq('id', id);

    // Optionally persist the updated analysis to Supermemory.
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settingsData = (settingsRow?.data as Record<string, unknown>) ?? {};
    if (settingsData?.memoryEnabled === true) {
      const supermemoryApiKey = (
        (settingsData?.memoryApiKey as string | undefined) ||
        process.env.SUPERMEMORY_API_KEY ||
        ''
      ).trim();
      if (supermemoryApiKey && ownerId) {
        const receivedAt = data.received_at ? new Date(data.received_at) : new Date();
        const entry = buildMemoryEntryFromAnalysis(
          {
            logId: id,
            date: receivedAt.toISOString().slice(0, 10),
            timestamp: receivedAt.toISOString(),
            fromAddress: typeof data.from_address === 'string' ? data.from_address : '',
            subject: typeof data.subject === 'string' ? data.subject : '',
            ruleApplied: typeof data.rule_applied === 'string' ? data.rule_applied : undefined,
            wasSummarized: typeof data.rule_applied === 'string' && data.rule_applied.length > 0,
          },
          safeAnalysis,
        );
        try {
          await saveToSupermemory(supermemoryApiKey, ownerId, entry);
        } catch (err) {
          console.error(`[email/${id}/analysis] failed to save to Supermemory:`, err);
        }
      }
    }

    return NextResponse.json({ analysis: safeAnalysis });
  } catch (error) {
    return handleUserError(error, 'email/[id]/analysis');
  }
}
