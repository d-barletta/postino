import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAssignedEmail } from '@/lib/email';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const MAX_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const domain = resolveAssignedEmailDomain((settingsRow?.data ?? {}) as Record<string, unknown>);

    // Generate a unique email address with collision detection
    let newEmail = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = generateAssignedEmail(domain);
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('assigned_email', candidate)
        .limit(1);
      if (!existing || existing.length === 0) {
        newEmail = candidate;
        break;
      }
    }

    if (!newEmail) {
      return NextResponse.json(
        { error: 'Could not generate a unique email address' },
        { status: 500 },
      );
    }

    await supabase.from('users').update({ assigned_email: newEmail }).eq('id', user.id);

    return NextResponse.json({ assignedEmail: newEmail });
  } catch (error) {
    return handleUserError(error, 'email/generate POST');
  }
}
