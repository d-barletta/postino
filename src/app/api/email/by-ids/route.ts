import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { dollarsToCredits, resolveCreditSettings } from '@/lib/credits';

const MAX_IDS = 20;

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids)
      ? (body.ids as unknown[])
          .slice(0, MAX_IDS)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const creditSettings = resolveCreditSettings(
      (settingsRow?.data as Record<string, unknown> | undefined) ?? {},
    );
    const { data: rows } = await supabase
      .from('email_logs')
      .select('*')
      .in('id', ids)
      .eq('user_id', user.id);

    const logs = (rows ?? []).map((d) => ({
      id: d.id,
      toAddress: (d.to_address as string) || '',
      fromAddress: (d.from_address as string) || '',
      ccAddress: (d.cc_address as string | undefined) || undefined,
      bccAddress: (d.bcc_address as string | undefined) || undefined,
      subject: (d.subject as string) || '',
      receivedAt: d.received_at ?? null,
      processedAt: d.processed_at ?? null,
      status: d.status,
      ruleApplied: d.rule_applied,
      tokensUsed: d.tokens_used,
      estimatedCredits: dollarsToCredits(
        typeof d.estimated_cost === 'number' ? d.estimated_cost : 0,
        creditSettings.creditsPerDollarFactor,
      ),
      errorMessage: d.error_message,
      attachmentCount: (d.attachment_count as number) ?? 0,
      attachmentNames: (d.attachment_names as string[]) ?? [],
      userId: d.user_id,
      emailAnalysis: d.email_analysis ?? null,
    }));

    return NextResponse.json({ logs });
  } catch (error) {
    return handleUserError(error, 'email/by-ids POST');
  }
}
