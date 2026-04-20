import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeStoredEmailLogWithDebug } from '@/lib/email-analysis';
import { saveToSupermemory, buildMemoryEntryFromAnalysis } from '@/agents/email-agent';

const MAX_PROCESS_BATCH = 5;

export const maxDuration = 200; //max: 300 in hobby plan and 800 in pro plan

async function clearEmailAnalyses(logIds: string[]): Promise<void> {
  if (logIds.length === 0) return;
  const supabase = createAdminClient();
  const BATCH_SIZE = 500;
  for (let i = 0; i < logIds.length; i += BATCH_SIZE) {
    const chunk = logIds.slice(i, i + BATCH_SIZE);
    await supabase.from('email_logs').update({ email_analysis: null }).in('id', chunk);
  }
}

async function invalidateDerivedUserData(uid: string): Promise<void> {
  const supabase = createAdminClient();
  await Promise.all([
    supabase.from('entity_relations').delete().eq('user_id', uid),
    supabase.from('entity_flows').delete().eq('user_id', uid),
    supabase.from('entity_place_maps').delete().eq('user_id', uid),
    supabase.from('entity_merge_suggestions').delete().eq('user_id', uid),
  ]);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const supabase = createAdminClient();

    const { data: userRow } = await supabase
      .from('users')
      .select('analysis_output_language, email')
      .eq('id', uid)
      .single();
    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'prepare' | 'process';
      emailIds?: string[];
    };

    const action = body.action ?? 'prepare';

    if (action === 'prepare') {
      const { data: logRows } = await supabase
        .from('email_logs')
        .select('id')
        .eq('user_id', uid)
        .order('received_at', { ascending: false });

      const logIds = (logRows ?? []).map((r) => r.id as string);
      await clearEmailAnalyses(logIds);
      await invalidateDerivedUserData(uid);

      return NextResponse.json({
        totalCount: logIds.length,
        emailIds: logIds,
      });
    }

    if (action === 'process') {
      const analysisOutputLanguage =
        typeof userRow.analysis_output_language === 'string'
          ? (userRow.analysis_output_language as string) || undefined
          : undefined;
      const userEmail = typeof userRow.email === 'string' ? userRow.email : '';

      if (!Array.isArray(body.emailIds)) {
        return NextResponse.json({ error: 'emailIds must be an array' }, { status: 400 });
      }

      const emailIds = body.emailIds.slice(0, MAX_PROCESS_BATCH);

      const { data: settingsRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'global')
        .single();
      const settingsData = settingsRow?.data as Record<string, unknown> | undefined;
      const memoryEnabled = settingsData?.memoryEnabled === true;
      const supermemoryApiKey = memoryEnabled
        ? (
            (settingsData?.memoryApiKey as string | undefined) ||
            process.env.SUPERMEMORY_API_KEY ||
            ''
          ).trim()
        : '';

      let reanalyzedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const emailId of emailIds) {
        const { data: logRow } = await supabase
          .from('email_logs')
          .select('from_address, subject, original_body, received_at, rule_applied')
          .eq('id', emailId)
          .single();

        if (!logRow) {
          skippedCount += 1;
          continue;
        }

        const originalBody = typeof logRow.original_body === 'string' ? logRow.original_body : '';
        if (!originalBody.trim()) {
          skippedCount += 1;
          continue;
        }

        try {
          const debugResult = await analyzeStoredEmailLogWithDebug({
            fromAddress: typeof logRow.from_address === 'string' ? logRow.from_address : '',
            subject: typeof logRow.subject === 'string' ? logRow.subject : '',
            originalBody,
            analysisOutputLanguage,
            openRouterUserId: userEmail,
            openRouterSessionId: emailId,
          });

          if (!debugResult.analysis) {
            throw new Error('Analysis unavailable');
          }

          await supabase
            .from('email_logs')
            .update({
              email_analysis: debugResult.analysis as unknown as import('@/types/supabase').Json,
              tokens_used: debugResult.tokensUsed,
              estimated_cost: debugResult.estimatedCost,
            })
            .eq('id', emailId);
          reanalyzedCount += 1;

          // Optionally persist the updated analysis to Supermemory.
          if (memoryEnabled && supermemoryApiKey) {
            const receivedAt = logRow.received_at ? new Date(logRow.received_at) : new Date();
            const entry = buildMemoryEntryFromAnalysis(
              {
                logId: emailId,
                date: receivedAt.toISOString().slice(0, 10),
                timestamp: receivedAt.toISOString(),
                fromAddress: typeof logRow.from_address === 'string' ? logRow.from_address : '',
                subject: typeof logRow.subject === 'string' ? logRow.subject : '',
                ruleApplied:
                  typeof logRow.rule_applied === 'string' ? logRow.rule_applied : undefined,
                wasSummarized:
                  typeof logRow.rule_applied === 'string' && logRow.rule_applied.length > 0,
              },
              debugResult.analysis,
            );
            try {
              await saveToSupermemory(supermemoryApiKey, uid, entry);
            } catch (err) {
              console.error(
                `[admin/users/${uid}/analysis] failed to save log ${emailId} to Supermemory:`,
                err,
              );
            }
          }
        } catch (error) {
          failedCount += 1;
          console.error(`[admin/users/${uid}/analysis] failed to analyze log ${emailId}:`, error);
        }
      }

      return NextResponse.json({ reanalyzedCount, failedCount, skippedCount });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleAdminError(error, 'admin/users/[uid]/analysis POST');
  }
}
