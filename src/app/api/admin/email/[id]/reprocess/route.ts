import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processEmailWithAgent } from '@/lib/agent';
import { processEmailWithAgent as processEmailWithSandbox } from '@/agents/sandbox-email-agent';
import type { RuleForProcessing } from '@/lib/openrouter';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

/** Returns true if the value contains the pattern (case-insensitive), or if pattern is empty. */
function matchesPattern(value: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) return true;
  return value.toLowerCase().includes(pattern.toLowerCase());
}

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

    // Parse optional model override from request body
    let modelOverride: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.model === 'string' && body.model.trim()) {
        modelOverride = body.model.trim();
      }
    } catch {
      // No body or invalid JSON — proceed without model override
    }

    const userId = logRow.user_id as string;
    const emailFrom = (logRow.from_address as string) || '';
    const emailSubject = (logRow.subject as string) || '';
    const originalBody = (logRow.original_body as string) || '';

    // Fetch the email owner's analysis language preference
    const { data: userRow } = await supabase
      .from('users')
      .select('analysis_output_language')
      .eq('id', userId)
      .single();
    const analysisOutputLanguage =
      typeof userRow?.analysis_output_language === 'string'
        ? (userRow.analysis_output_language as string) || undefined
        : undefined;

    // Fetch active rules for this email's owner
    const { data: rulesRows } = await supabase
      .from('rules')
      .select('id, name, text, match_sender, match_subject, match_body, sort_order, created_at')
      .eq('user_id', userId)
      .eq('is_active', true);

    // Sort rules by sort_order ASC (user-defined), then by created_at ASC as tiebreaker,
    // so rules are always applied in a deterministic order that matches what the user sees.
    const allRules = (rulesRows ?? [])
      .sort((a, b) => {
        const aOrder =
          typeof a.sort_order === 'number' ? (a.sort_order as number) : Number.MAX_SAFE_INTEGER;
        const bOrder =
          typeof b.sort_order === 'number' ? (b.sort_order as number) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const aTime = a.created_at ? new Date(a.created_at as string).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at as string).getTime() : 0;
        return aTime - bTime;
      })
      .map((d) => ({
        id: d.id as string,
        name: (d.name as string) || (d.id as string),
        text: d.text as string,
        matchSender: (d.match_sender as string) || '',
        matchSubject: (d.match_subject as string) || '',
        matchBody: (d.match_body as string) || '',
      }));

    // Filter rules by pattern matching (same logic as the inbound route)
    const matchingRules: RuleForProcessing[] = allRules.filter(
      (r) =>
        matchesPattern(emailFrom, r.matchSender) &&
        matchesPattern(emailSubject, r.matchSubject) &&
        matchesPattern(originalBody, r.matchBody),
    );

    // Detect whether the original body is HTML
    const isHtml = /<[a-z][\s\S]*>/i.test(originalBody);

    // Load global settings to check if sandbox agent is enabled
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settings = (settingsRow?.data as Record<string, unknown> | null) ?? {};

    const opencodeMinLen =
      typeof settings?.opencodeMinBodyLength === 'number'
        ? (settings.opencodeMinBodyLength as number)
        : 50000;
    const useSandbox = settings?.agentUseOpencode === true && originalBody.length >= opencodeMinLen;
    const agentFn = useSandbox ? processEmailWithSandbox : processEmailWithAgent;

    const result = await agentFn(
      userId,
      id,
      emailFrom,
      emailSubject,
      originalBody,
      matchingRules,
      isHtml,
      modelOverride,
      undefined, // attachmentNames — not stored on reprocessed logs
      analysisOutputLanguage,
    );

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      ruleApplied: result.ruleApplied,
    });
  } catch (error) {
    return handleAdminError(error, 'admin/email/[id]/reprocess POST');
  }
}
