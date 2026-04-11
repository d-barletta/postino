import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateAssignedEmail,
  resolveAssignedEmailDomain,
  isEmailUsingDomain,
} from '@/lib/email-utils';
import { verifyUserRequest } from '@/lib/api-auth';

const MAX_ASSIGNED_EMAIL_ATTEMPTS = 10;

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settingsData = (settingsRow?.data as Record<string, unknown>) ?? {};
    const assignedDomain = resolveAssignedEmailDomain(
      settingsData as {
        emailDomain?: string;
        mailgunSandboxEmail?: string;
        mailgunDomain?: string;
      },
    );
    const loginEmail = user.email ?? '';

    if (isEmailUsingDomain(loginEmail, assignedDomain)) {
      return NextResponse.json(
        { error: "Can't create an account using our email addresses" },
        { status: 403 },
      );
    }

    let { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single();

    if (!userData) {
      if (settingsData?.signupMaintenanceMode === true) {
        return NextResponse.json(
          { error: 'Signup is temporarily suspended during maintenance' },
          { status: 403 },
        );
      }

      const domain = resolveAssignedEmailDomain(
        settingsData as {
          emailDomain?: string;
          mailgunSandboxEmail?: string;
          mailgunDomain?: string;
        },
      );
      let assignedEmail = '';

      for (let attempt = 0; attempt < MAX_ASSIGNED_EMAIL_ATTEMPTS; attempt++) {
        const candidate = generateAssignedEmail(domain);
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('assigned_email', candidate)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          assignedEmail = candidate;
          break;
        }
      }

      if (!assignedEmail) {
        return NextResponse.json({ error: 'Failed to provision assigned email' }, { status: 500 });
      }

      const SUPPORTED_LOCALES = ['en', 'it', 'es', 'fr', 'de'];
      const requestedLocale = (request.headers.get('X-Locale') ?? '').toLowerCase();
      const analysisOutputLanguage = SUPPORTED_LOCALES.includes(requestedLocale)
        ? requestedLocale
        : 'en';

      await supabase.from('users').insert({
        id: user.id,
        email: user.email ?? '',
        assigned_email: assignedEmail,
        created_at: new Date().toISOString(),
        is_admin: false,
        is_active: false,
        suspended: false,
        analysis_output_language: analysisOutputLanguage,
      });
      const { data: newUserData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      userData = newUserData;
    } else {
      if (userData.suspended) {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
      }
      if (!!user.email_confirmed_at && !userData.is_active && !userData.suspended) {
        await supabase.from('users').update({ is_active: true }).eq('id', user.id);
        const { data: refreshed } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        userData = refreshed;
      }
    }

    const domain = resolveAssignedEmailDomain(
      settingsData as {
        emailDomain?: string;
        mailgunSandboxEmail?: string;
        mailgunDomain?: string;
      },
    );
    const assignedEmail = userData?.assigned_email as string | undefined;
    const localPart = assignedEmail?.split('@')[0]?.trim();

    if (localPart && assignedEmail?.toLowerCase() !== `${localPart}@${domain}`.toLowerCase()) {
      await supabase
        .from('users')
        .update({ assigned_email: `${localPart}@${domain}`.toLowerCase() })
        .eq('id', user.id);
      const { data: refreshed } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      userData = refreshed;
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const safeUserData = userData;
    return NextResponse.json({
      user: {
        uid: user.id,
        email: safeUserData.email,
        assignedEmail: safeUserData.assigned_email,
        isAdmin: safeUserData.is_admin,
        isActive: safeUserData.is_active,
        suspended: safeUserData.suspended,
        analysisOutputLanguage: safeUserData.analysis_output_language,
        isAddressEnabled: safeUserData.is_address_enabled,
        isAiAnalysisOnlyEnabled: safeUserData.is_ai_analysis_only_enabled,
        isForwardingHeaderEnabled: safeUserData.is_forwarding_header_enabled,
        displayName: safeUserData.display_name,
        createdAt: safeUserData.created_at ?? null,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
