import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';

const USER_UPDATE_BATCH_SIZE = 400;

const AGENT_LIMITS = {
  agentChunkThresholdChars: { min: 5000, max: 300000 },
  agentChunkSizeChars: { min: 1000, max: 100000 },
  agentChunkExtractMaxTokens: { min: 100, max: 4000 },
  agentAnalysisMaxTokens: { min: 100, max: 2000 },
  agentBodyAnalysisMaxChars: { min: 500, max: 50000 },
  agentChunkFallbackMaxChars: { min: 200, max: 10000 },
  agentFallbackMaxTokens: { min: 500, max: 6000 },
} as const;

function clampInt(value: unknown, min: number, max: number): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function pickDomainSettings(source: Record<string, unknown>) {
  return {
    emailDomain: typeof source.emailDomain === 'string' ? source.emailDomain : undefined,
    mailgunSandboxEmail: typeof source.mailgunSandboxEmail === 'string' ? source.mailgunSandboxEmail : undefined,
    mailgunDomain: typeof source.mailgunDomain === 'string' ? source.mailgunDomain : undefined,
  };
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = adminDb();
    const snap = await db.collection('settings').doc('global').get();

    if (!snap.exists) {
      return NextResponse.json({ settings: {} });
    }

    const data = snap.data()!;
    return NextResponse.json({
      settings: {
        ...data,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const updates = await request.json();
    const db = adminDb();
    const settingsRef = db.collection('settings').doc('global');
    const currentSettingsSnap = await settingsRef.get();
    const currentSettings = currentSettingsSnap.data() || {};

    const allowed = [
      'maxRuleLength', 'maxActiveRules', 'llmModel', 'llmApiKey', 'llmMaxTokens', 'llmSystemPrompt', 'emailSubjectPrefix',
      'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpFrom', 'smtpFromName', 'smtpFromEmail',
      'emailDomain',
      'mailgunApiKey', 'mailgunWebhookSigningKey', 'mailgunWebhookLoggingEnabled', 'mailgunDomain', 'mailgunSandboxEmail', 'mailgunBaseUrl',
      'maintenanceMode', 'signupMaintenanceMode', 'rulesExecutionMode',
      'agentChunkThresholdChars', 'agentChunkSizeChars', 'agentChunkExtractMaxTokens',
      'agentAnalysisMaxTokens', 'agentBodyAnalysisMaxChars', 'agentChunkFallbackMaxChars',
      'agentFallbackMaxTokens', 'agentTracingEnabled', 'agentTraceIncludeExcerpts',
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    const normalized = Object.fromEntries(
      Object.entries(filtered).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ])
    );

    const normalizedWithBounds = {
      ...normalized,
      agentChunkThresholdChars: clampInt(
        normalized.agentChunkThresholdChars,
        AGENT_LIMITS.agentChunkThresholdChars.min,
        AGENT_LIMITS.agentChunkThresholdChars.max
      ),
      agentChunkSizeChars: clampInt(
        normalized.agentChunkSizeChars,
        AGENT_LIMITS.agentChunkSizeChars.min,
        AGENT_LIMITS.agentChunkSizeChars.max
      ),
      agentChunkExtractMaxTokens: clampInt(
        normalized.agentChunkExtractMaxTokens,
        AGENT_LIMITS.agentChunkExtractMaxTokens.min,
        AGENT_LIMITS.agentChunkExtractMaxTokens.max
      ),
      agentAnalysisMaxTokens: clampInt(
        normalized.agentAnalysisMaxTokens,
        AGENT_LIMITS.agentAnalysisMaxTokens.min,
        AGENT_LIMITS.agentAnalysisMaxTokens.max
      ),
      agentBodyAnalysisMaxChars: clampInt(
        normalized.agentBodyAnalysisMaxChars,
        AGENT_LIMITS.agentBodyAnalysisMaxChars.min,
        AGENT_LIMITS.agentBodyAnalysisMaxChars.max
      ),
      agentChunkFallbackMaxChars: clampInt(
        normalized.agentChunkFallbackMaxChars,
        AGENT_LIMITS.agentChunkFallbackMaxChars.min,
        AGENT_LIMITS.agentChunkFallbackMaxChars.max
      ),
      agentFallbackMaxTokens: clampInt(
        normalized.agentFallbackMaxTokens,
        AGENT_LIMITS.agentFallbackMaxTokens.min,
        AGENT_LIMITS.agentFallbackMaxTokens.max
      ),
    };

    const nextSettings = { ...currentSettings, ...normalizedWithBounds };

    // Validate mailgunBaseUrl to prevent SSRF: only permit known Mailgun API hosts.
    const ALLOWED_MAILGUN_HOSTNAMES = new Set([
      'api.mailgun.net',
      'api.eu.mailgun.net',
    ]);
    if (
      typeof normalized.mailgunBaseUrl === 'string' &&
      normalized.mailgunBaseUrl.length > 0
    ) {
      let parsedMgUrl: URL;
      try {
        parsedMgUrl = new URL(normalized.mailgunBaseUrl);
      } catch {
        return NextResponse.json(
          { error: 'Invalid mailgunBaseUrl: must be a valid URL (https://api.mailgun.net or https://api.eu.mailgun.net)' },
          { status: 400 }
        );
      }
      if (
        parsedMgUrl.protocol !== 'https:' ||
        !ALLOWED_MAILGUN_HOSTNAMES.has(parsedMgUrl.hostname)
      ) {
        return NextResponse.json(
          { error: 'Invalid mailgunBaseUrl: must be https://api.mailgun.net or https://api.eu.mailgun.net' },
          { status: 400 }
        );
      }
    }

    const nextChunkThreshold = nextSettings.agentChunkThresholdChars;
    const nextChunkSize = nextSettings.agentChunkSizeChars;
    if (
      typeof nextChunkThreshold === 'number' &&
      typeof nextChunkSize === 'number' &&
      nextChunkSize >= nextChunkThreshold
    ) {
      return NextResponse.json(
        { error: 'Agent Settings invalid: agentChunkSizeChars must be smaller than agentChunkThresholdChars.' },
        { status: 400 }
      );
    }

    const previousAssignedEmailDomain = resolveAssignedEmailDomain(
      pickDomainSettings(currentSettings as Record<string, unknown>)
    );
    const nextAssignedEmailDomain = resolveAssignedEmailDomain(
      pickDomainSettings(nextSettings as Record<string, unknown>)
    );

    await settingsRef.set(
      { ...normalizedWithBounds, updatedAt: Timestamp.now() },
      { merge: true }
    );

    let reassignedUsers = 0;

    if (previousAssignedEmailDomain !== nextAssignedEmailDomain) {
      const usersSnap = await db.collection('users').get();

      for (let i = 0; i < usersSnap.docs.length; i += USER_UPDATE_BATCH_SIZE) {
        const batch = db.batch();
        const docs = usersSnap.docs.slice(i, i + USER_UPDATE_BATCH_SIZE);

        for (const userDoc of docs) {
          const assignedEmail = userDoc.data().assignedEmail as string | undefined;
          if (!assignedEmail) continue;

          const localPart = assignedEmail.split('@')[0]?.trim();
          if (!localPart) continue;

          batch.update(userDoc.ref, {
            assignedEmail: `${localPart}@${nextAssignedEmailDomain}`.toLowerCase(),
          });
          reassignedUsers += 1;
        }

        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      assignedEmailDomain: nextAssignedEmailDomain,
      reassignedUsers,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
