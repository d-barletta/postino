import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';
import { DEFAULT_CREDITS_PER_DOLLAR_FACTOR, DEFAULT_FREE_CREDITS_PER_MONTH } from '@/lib/credits';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const data = (settingsRow?.data as Record<string, unknown>) ?? {};

    return NextResponse.json({
      maxRuleLength: data?.maxRuleLength ?? 1000,
      assignedEmailDomain: resolveAssignedEmailDomain(
        data as { emailDomain?: string; mailgunSandboxEmail?: string; mailgunDomain?: string },
      ),
      signupMaintenanceMode: data?.signupMaintenanceMode === true,
      creditsPerDollarFactor:
        typeof data?.creditsPerDollarFactor === 'number'
          ? data.creditsPerDollarFactor
          : DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
      freeCreditsPerMonth:
        typeof data?.freeCreditsPerMonth === 'number'
          ? data.freeCreditsPerMonth
          : DEFAULT_FREE_CREDITS_PER_MONTH,
    });
  } catch (err) {
    console.warn('[settings/public] Supabase read failed, using defaults:', err);
    return NextResponse.json({
      maxRuleLength: 1000,
      assignedEmailDomain: resolveAssignedEmailDomain(),
      signupMaintenanceMode: false,
      creditsPerDollarFactor: DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
      freeCreditsPerMonth: DEFAULT_FREE_CREDITS_PER_MONTH,
    });
  }
}
