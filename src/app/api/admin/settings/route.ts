import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import type { Json } from '@/types/supabase';
import { DEFAULT_CREDITS_PER_DOLLAR_FACTOR, DEFAULT_FREE_CREDITS_PER_MONTH } from '@/lib/credits';

const AGENT_LIMITS = {
  agentChunkThresholdChars: { min: 5000, max: 300000 },
  agentChunkSizeChars: { min: 1000, max: 100000 },
  agentChunkExtractMaxTokens: { min: 100, max: 4000 },
  agentAnalysisMaxTokens: { min: 100, max: 2000 },
  agentBodyAnalysisMaxChars: { min: 500, max: 50000 },
  agentChunkFallbackMaxChars: { min: 200, max: 10000 },
  agentFallbackMaxTokens: { min: 500, max: 6000 },
} as const;

const OPENCODE_SKILL_KEYS = ['caveman', 'html-email-editing'] as const;

function clampInt(value: unknown, min: number, max: number): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function pickDomainSettings(source: Record<string, unknown>) {
  return {
    emailDomain: typeof source.emailDomain === 'string' ? source.emailDomain : undefined,
    mailgunSandboxEmail:
      typeof source.mailgunSandboxEmail === 'string' ? source.mailgunSandboxEmail : undefined,
    mailgunDomain: typeof source.mailgunDomain === 'string' ? source.mailgunDomain : undefined,
  };
}

function normalizeOpencodeSkillToggles(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const normalized: Record<string, boolean> = {};
  for (const key of OPENCODE_SKILL_KEYS) {
    if (typeof input[key] === 'boolean') {
      normalized[key] = input[key] as boolean;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data, updated_at')
      .eq('id', 'global')
      .single();

    if (!settingsRow) {
      return NextResponse.json({ settings: {} });
    }

    const data = settingsRow.data as Record<string, unknown>;
    return NextResponse.json({
      settings: {
        ...data,
        creditsPerDollarFactor:
          typeof data.creditsPerDollarFactor === 'number'
            ? data.creditsPerDollarFactor
            : DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
        freeCreditsPerMonth:
          typeof data.freeCreditsPerMonth === 'number'
            ? data.freeCreditsPerMonth
            : DEFAULT_FREE_CREDITS_PER_MONTH,
        updatedAt: settingsRow.updated_at ?? null,
      },
    });
  } catch (error) {
    return handleAdminError(error, 'admin/settings GET');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const updates = await request.json();
    const supabase = createAdminClient();
    const { data: currentSettingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const currentSettings = (currentSettingsRow?.data as Record<string, unknown> | null) ?? {};

    const allowed = [
      'maxRuleLength',
      'maxActiveRules',
      'llmModel',
      'llmApiKey',
      'llmMaxTokens',
      'llmSystemPrompt',
      'emailSubjectPrefix',
      'smtpHost',
      'smtpPort',
      'smtpUser',
      'smtpPass',
      'smtpFrom',
      'smtpFromName',
      'smtpFromEmail',
      'emailDomain',
      'mailgunApiKey',
      'mailgunWebhookSigningKey',
      'mailgunWebhookLoggingEnabled',
      'mailgunDomain',
      'mailgunSandboxEmail',
      'mailgunBaseUrl',
      'maintenanceMode',
      'signupMaintenanceMode',
      'rulesExecutionMode',
      'agentChunkThresholdChars',
      'agentChunkSizeChars',
      'agentChunkExtractMaxTokens',
      'agentAnalysisMaxTokens',
      'agentBodyAnalysisMaxChars',
      'agentChunkFallbackMaxChars',
      'agentFallbackMaxTokens',
      'agentTracingEnabled',
      'agentTraceIncludeExcerpts',
      'memoryEnabled',
      'memoryApiKey',
      'googleMapsApiKey',
      'creditsPerDollarFactor',
      'freeCreditsPerMonth',
      'agentUseOpencode',
      'opencodeSandboxSnapshotId',
      'opencodeMinBodyLength',
      'opencodeSkillToggles',
      'opencodeVerificationPass',
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k)),
    );
    const normalized = Object.fromEntries(
      Object.entries(filtered).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ]),
    );
    const normalizedOpencodeSkillToggles = normalizeOpencodeSkillToggles(
      normalized.opencodeSkillToggles,
    );

    // Validate mailgunBaseUrl to prevent SSRF: only official Mailgun API base URLs are accepted.
    const ALLOWED_MAILGUN_BASE_URLS = new Set([
      'https://api.mailgun.net',
      'https://api.eu.mailgun.net',
    ]);
    if (
      'mailgunBaseUrl' in normalized &&
      normalized.mailgunBaseUrl !== '' &&
      !ALLOWED_MAILGUN_BASE_URLS.has(normalized.mailgunBaseUrl as string)
    ) {
      return NextResponse.json(
        {
          error: `mailgunBaseUrl must be one of: ${[...ALLOWED_MAILGUN_BASE_URLS].join(', ')}`,
        },
        { status: 400 },
      );
    }

    const normalizedWithBounds = {
      ...normalized,
      ...(normalizedOpencodeSkillToggles !== undefined
        ? { opencodeSkillToggles: normalizedOpencodeSkillToggles }
        : {}),
      creditsPerDollarFactor: clampPositiveInt(
        normalized.creditsPerDollarFactor,
        DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
        1,
        100000,
      ),
      freeCreditsPerMonth: clampPositiveInt(
        normalized.freeCreditsPerMonth,
        DEFAULT_FREE_CREDITS_PER_MONTH,
        0,
        100000000,
      ),
      agentChunkThresholdChars: clampInt(
        normalized.agentChunkThresholdChars,
        AGENT_LIMITS.agentChunkThresholdChars.min,
        AGENT_LIMITS.agentChunkThresholdChars.max,
      ),
      agentChunkSizeChars: clampInt(
        normalized.agentChunkSizeChars,
        AGENT_LIMITS.agentChunkSizeChars.min,
        AGENT_LIMITS.agentChunkSizeChars.max,
      ),
      agentChunkExtractMaxTokens: clampInt(
        normalized.agentChunkExtractMaxTokens,
        AGENT_LIMITS.agentChunkExtractMaxTokens.min,
        AGENT_LIMITS.agentChunkExtractMaxTokens.max,
      ),
      agentAnalysisMaxTokens: clampInt(
        normalized.agentAnalysisMaxTokens,
        AGENT_LIMITS.agentAnalysisMaxTokens.min,
        AGENT_LIMITS.agentAnalysisMaxTokens.max,
      ),
      agentBodyAnalysisMaxChars: clampInt(
        normalized.agentBodyAnalysisMaxChars,
        AGENT_LIMITS.agentBodyAnalysisMaxChars.min,
        AGENT_LIMITS.agentBodyAnalysisMaxChars.max,
      ),
      agentChunkFallbackMaxChars: clampInt(
        normalized.agentChunkFallbackMaxChars,
        AGENT_LIMITS.agentChunkFallbackMaxChars.min,
        AGENT_LIMITS.agentChunkFallbackMaxChars.max,
      ),
      agentFallbackMaxTokens: clampInt(
        normalized.agentFallbackMaxTokens,
        AGENT_LIMITS.agentFallbackMaxTokens.min,
        AGENT_LIMITS.agentFallbackMaxTokens.max,
      ),
    };

    const nextSettings = { ...currentSettings, ...normalizedWithBounds };

    const nextChunkThreshold = nextSettings.agentChunkThresholdChars;
    const nextChunkSize = nextSettings.agentChunkSizeChars;
    if (
      typeof nextChunkThreshold === 'number' &&
      typeof nextChunkSize === 'number' &&
      nextChunkSize >= nextChunkThreshold
    ) {
      return NextResponse.json(
        {
          error:
            'Agent Settings invalid: agentChunkSizeChars must be smaller than agentChunkThresholdChars.',
        },
        { status: 400 },
      );
    }

    const previousAssignedEmailDomain = resolveAssignedEmailDomain(
      pickDomainSettings(currentSettings as Record<string, unknown>),
    );
    const nextAssignedEmailDomain = resolveAssignedEmailDomain(
      pickDomainSettings(nextSettings as Record<string, unknown>),
    );

    await supabase.from('settings').upsert({
      id: 'global',
      data: nextSettings as unknown as Json,
      updated_at: new Date().toISOString(),
    });

    let reassignedUsers = 0;

    if (previousAssignedEmailDomain !== nextAssignedEmailDomain) {
      const { data: usersData } = await supabase.from('users').select('id, assigned_email');
      const toReassign = (usersData ?? []).filter((u) => {
        const localPart = u.assigned_email?.split('@')[0]?.trim();
        return !!localPart;
      });

      await Promise.all(
        toReassign.map((u) => {
          const localPart = u.assigned_email!.split('@')[0].trim();
          return supabase
            .from('users')
            .update({
              assigned_email: `${localPart}@${nextAssignedEmailDomain}`.toLowerCase(),
            })
            .eq('id', u.id);
        }),
      );
      reassignedUsers = toReassign.length;
    }

    return NextResponse.json({
      success: true,
      assignedEmailDomain: nextAssignedEmailDomain,
      reassignedUsers,
    });
  } catch (error) {
    return handleAdminError(error, 'admin/settings PUT');
  }
}
