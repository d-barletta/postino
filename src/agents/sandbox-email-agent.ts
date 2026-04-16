/**
 * sandbox-email-agent.ts — OpenCode Sandbox-based email processing agent.
 *
 * Alternative to the default email-agent that offloads HTML editing to an
 * OpenCode session running inside a Vercel Sandbox.  This avoids hitting
 * model context-window limits for very large emails because OpenCode manages
 * its own context autonomously.
 *
 * The agent:
 *   1. Loads settings, pre-analyses the email, and builds memory context
 *      (same as the standard agent).
 *   2. Spins up a Vercel Sandbox from a pre-built snapshot that has OpenCode
 *      installed (`opencode-ai`).
 *   3. Writes the email HTML + an `opencode.json` config (pointing at the
 *      configured OpenRouter model) into the sandbox filesystem.
 *   4. Runs `opencode run` with a prompt that embeds the user's rules.
 *   5. Reads the modified email HTML back from the sandbox.
 *   6. Stores the OpenCode session ID in the `email_logs` row for later
 *      recovery / debugging.
 *
 * Signature is identical to `processEmailWithAgent` in `email-agent.ts` so
 * the two can be swapped via an admin toggle.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Sandbox } from '@vercel/sandbox';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sanitizeRule,
  sanitizeEmailField,
  getOpenRouterClient,
  getModelPricing,
  calculateCost,
  type AgentTrace,
  type AgentTraceStep,
} from '@/lib/openrouter';
import type { ProcessEmailResult, RuleForProcessing } from '@/lib/openrouter';
import type { EmailAnalysis, EmailMemoryEntry } from '@/types';
import type { EmailAttachment } from '@/lib/email';
import { extractStoredPlaceNames } from '@/lib/place-utils';
import {
  getUserMemory,
  saveUserMemory,
  buildMemoryEntryFromAnalysis,
  buildMemoryContext,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
} from './email-agent';

// Re-export memory helpers so consumers can import from either agent module.
export {
  getUserMemory,
  saveUserMemory,
  buildMemoryEntryFromAnalysis,
  buildMemoryContext,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
} from './email-agent';

// Also re-export analyzeEmailContent for parity with the standard agent.
export { analyzeEmailContent } from './email-agent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Env var (or settings) holding the snapshot ID created by the setup script. */
const SNAPSHOT_ID_ENV = 'OPENCODE_SANDBOX_SNAPSHOT_ID';

/** Max time (ms) the sandbox is allowed to run before we kill it. */
const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Max time (ms) we wait for the `opencode run` command. */
const OPENCODE_RUN_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses the JSON event stream emitted by `opencode run --format json` and
 * returns the total prompt and completion tokens used in the session.
 *
 * OpenCode emits newline-delimited JSON objects.  We look for any object that
 * carries `tokensIn` / `tokensOut` (session-level totals on the last event)
 * and fall back to summing `inputTokens` / `outputTokens` from individual
 * message-part events if the session total is not present.
 */
function parseOpencodeTokens(stdout: string): { promptTokens: number; completionTokens: number } {
  function getUsageCandidate(source: unknown): Record<string, unknown> | undefined {
    if (!source || typeof source !== 'object') return undefined;
    const value = (source as Record<string, unknown>).usage;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  }

  function normalizeUsageTotals(usage: Record<string, unknown>): {
    promptTokens: number;
    completionTokens: number;
  } {
    const totalTokens =
      typeof usage.totalTokens === 'number'
        ? usage.totalTokens
        : typeof usage.total_tokens === 'number'
          ? usage.total_tokens
          : 0;
    let promptTokens =
      typeof usage.inputTokens === 'number'
        ? usage.inputTokens
        : typeof usage.prompt_tokens === 'number'
          ? usage.prompt_tokens
          : 0;
    let completionTokens =
      typeof usage.outputTokens === 'number'
        ? usage.outputTokens
        : typeof usage.completion_tokens === 'number'
          ? usage.completion_tokens
          : 0;

    if (totalTokens > 0 && promptTokens + completionTokens === 0) {
      promptTokens = totalTokens;
    } else if (totalTokens > 0 && promptTokens + completionTokens < totalTokens) {
      const missing = totalTokens - (promptTokens + completionTokens);
      // Preserve a deterministic split without inventing a new ratio: assign the
      // unknown remainder to the smaller side so prompt/completion stay balanced.
      if (promptTokens <= completionTokens) promptTokens += missing;
      else completionTokens += missing;
    }

    return { promptTokens, completionTokens };
  }

  let sessionPromptTokens: number | null = null;
  let sessionCompletionTokens: number | null = null;
  let fallbackPromptTokens = 0;
  let fallbackCompletionTokens = 0;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;

      // Session-level totals carried on session update events.
      if (typeof event.tokensIn === 'number') {
        sessionPromptTokens = Math.max(sessionPromptTokens ?? 0, event.tokensIn);
      }
      if (typeof event.tokensOut === 'number') {
        sessionCompletionTokens = Math.max(sessionCompletionTokens ?? 0, event.tokensOut);
      }

      // Nested session object (e.g. { type: 'session.updated', session: { tokensIn, tokensOut } })
      const session = event.session as Record<string, unknown> | undefined;
      if (session) {
        if (typeof session.tokensIn === 'number') {
          sessionPromptTokens = Math.max(sessionPromptTokens ?? 0, session.tokensIn);
        }
        if (typeof session.tokensOut === 'number') {
          sessionCompletionTokens = Math.max(sessionCompletionTokens ?? 0, session.tokensOut);
        }
      }

      // Per-message usage (accumulate only as fallback when session totals are absent).
      const eventMessage = 'message' in event ? event.message : undefined;
      const eventData = 'data' in event ? event.data : undefined;
      const usageCandidates = [
        getUsageCandidate(event),
        getUsageCandidate(eventMessage),
        getUsageCandidate(eventData),
      ].filter((u): u is Record<string, unknown> => Boolean(u));

      for (const usage of usageCandidates) {
        const normalized = normalizeUsageTotals(usage);
        fallbackPromptTokens += normalized.promptTokens;
        fallbackCompletionTokens += normalized.completionTokens;
      }
    } catch {
      // Non-JSON line — skip.
    }
  }

  if (sessionPromptTokens !== null || sessionCompletionTokens !== null) {
    return {
      promptTokens: Math.max(0, sessionPromptTokens ?? 0),
      completionTokens: Math.max(0, sessionCompletionTokens ?? 0),
    };
  }

  return {
    promptTokens: Math.max(0, fallbackPromptTokens),
    completionTokens: Math.max(0, fallbackCompletionTokens),
  };
}

function parseHumanReadableOpencodeNumber(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KMB])?$/i);
  if (!match) return null;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

function parseOpencodeStatsOutput(text: string): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  promptTokens: number;
  completionTokens: number;
} | null {
  const extractMetric = (label: string): number | null => {
    const regex = new RegExp(`\\|\\s*${label.replace(/ /g, '\\s+')}\\s+([^\\s|]+)\\s*\\|`, 'i');
    const match = text.match(regex);
    return match ? parseHumanReadableOpencodeNumber(match[1]) : null;
  };

  const inputTokens = extractMetric('Input');
  const outputTokens = extractMetric('Output');
  const cacheReadTokens = extractMetric('Cache Read') ?? 0;
  const cacheWriteTokens = extractMetric('Cache Write') ?? 0;

  if (
    inputTokens === null &&
    outputTokens === null &&
    cacheReadTokens === 0 &&
    cacheWriteTokens === 0
  ) {
    return null;
  }

  const promptBase = inputTokens ?? 0;
  const completionTokens = outputTokens ?? 0;

  return {
    inputTokens: promptBase,
    outputTokens: completionTokens,
    cacheReadTokens,
    cacheWriteTokens,
    promptTokens: promptBase + cacheReadTokens + cacheWriteTokens,
    completionTokens,
  };
}

function parseOpencodeSessionId(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      const candidates = [
        event.sessionID,
        event.sessionId,
        (event.session as Record<string, unknown> | undefined)?.id,
        (event.session as Record<string, unknown> | undefined)?.sessionID,
        (event.info as Record<string, unknown> | undefined)?.sessionID,
        (event.info as Record<string, unknown> | undefined)?.id,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.startsWith('ses_')) {
          return candidate;
        }
      }
    } catch {
      // Non-JSON line — skip.
    }
  }

  return null;
}

function readOpencodeTokenPair(
  value: unknown,
): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
  if (!value || typeof value !== 'object') return null;

  const tokens = value as Record<string, unknown>;
  const cache =
    tokens.cache && typeof tokens.cache === 'object'
      ? (tokens.cache as Record<string, unknown>)
      : null;

  const promptCandidates = [
    tokens.input,
    tokens.inputTokens,
    tokens.tokensIn,
    tokens.tokens_in,
    tokens.prompt_tokens,
    tokens.promptTokens,
  ];
  const completionCandidates = [
    tokens.output,
    tokens.outputTokens,
    tokens.tokensOut,
    tokens.tokens_out,
    tokens.completion_tokens,
    tokens.completionTokens,
  ];
  const totalCandidates = [tokens.total, tokens.totalTokens, tokens.total_tokens];

  const cacheWriteCandidates = [
    cache?.write,
    cache?.write_tokens,
    cache?.writeTokens,
    tokens.cache_write,
    tokens.cacheWrite,
    tokens.cached_input_tokens,
    tokens.cachedInputTokens,
  ];
  const cacheReadCandidates = [
    cache?.read,
    cache?.read_tokens,
    cache?.readTokens,
    tokens.cache_read,
    tokens.cacheRead,
  ];

  const promptTokens = promptCandidates.find((candidate) => typeof candidate === 'number');
  const completionTokens = completionCandidates.find((candidate) => typeof candidate === 'number');
  const totalTokens = totalCandidates.find((candidate) => typeof candidate === 'number');
  const cacheWriteTokens = cacheWriteCandidates.find((candidate) => typeof candidate === 'number');
  const cacheReadTokens = cacheReadCandidates.find((candidate) => typeof candidate === 'number');

  if (
    typeof promptTokens !== 'number' &&
    typeof completionTokens !== 'number' &&
    typeof cacheWriteTokens !== 'number' &&
    typeof cacheReadTokens !== 'number'
  ) {
    return null;
  }

  const promptBase = typeof promptTokens === 'number' ? promptTokens : 0;
  const cacheWrite = typeof cacheWriteTokens === 'number' ? cacheWriteTokens : 0;
  const cacheRead = typeof cacheReadTokens === 'number' ? cacheReadTokens : 0;
  const completion = typeof completionTokens === 'number' ? completionTokens : 0;
  const total =
    typeof totalTokens === 'number'
      ? totalTokens
      : promptBase + cacheWrite + cacheRead + completion;

  return {
    // OpenCode export may place most prompt usage in cache write/read buckets.
    promptTokens: promptBase + cacheWrite + cacheRead,
    completionTokens: completion,
    totalTokens: total,
  };
}

function extractUsageFromOpencodeExport(sessionData: Record<string, unknown>): {
  sessionId: string | null;
  promptTokens: number;
  completionTokens: number;
} {
  const sessionInfo = sessionData.info as Record<string, unknown> | undefined;
  const sessionId =
    typeof sessionInfo?.id === 'string' && sessionInfo.id.startsWith('ses_')
      ? sessionInfo.id
      : null;

  const topLevelTokens =
    readOpencodeTokenPair(sessionData.tokens) ??
    readOpencodeTokenPair(sessionInfo?.tokens) ??
    readOpencodeTokenPair(sessionData.usage) ??
    readOpencodeTokenPair(sessionData.stats);
  if (topLevelTokens) {
    return { sessionId, ...topLevelTokens };
  }

  let promptTokens = 0;
  let completionTokens = 0;
  const usageRecords: Array<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }> = [];
  const messages = sessionData.messages as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(messages)) {
    for (const message of messages) {
      const messageInfo = message.info as Record<string, unknown> | undefined;
      const messageTokens =
        readOpencodeTokenPair(messageInfo?.tokens) ??
        readOpencodeTokenPair(message.tokens) ??
        readOpencodeTokenPair(message.usage);

      if (messageTokens) {
        usageRecords.push(messageTokens);
        continue;
      }

      const parts = message.parts as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(parts)) continue;

      for (const part of parts) {
        const partTokens = readOpencodeTokenPair(part.tokens) ?? readOpencodeTokenPair(part.usage);
        if (!partTokens) continue;
        usageRecords.push(partTokens);
      }
    }
  }

  const recordsWithTotal = usageRecords.filter((record) => record.totalTokens > 0);

  if (recordsWithTotal.length > 0) {
    // OpenCode often reports cumulative totals per step/message. In that shape,
    // the latest/largest total is the authoritative session usage.
    const best = recordsWithTotal.reduce((maxRecord, record) =>
      record.totalTokens > maxRecord.totalTokens ? record : maxRecord,
    );
    return {
      sessionId,
      promptTokens: best.promptTokens,
      completionTokens: best.completionTokens,
    };
  }

  for (const record of usageRecords) {
    promptTokens += record.promptTokens;
    completionTokens += record.completionTokens;
  }

  return { sessionId, promptTokens, completionTokens };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;

  const candidate = text.slice(firstBrace).trim();
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recursively read all files from a directory and return them with their
 * relative paths (preserving subdirectory structure).
 */
async function readAgentsFolder(
  dirPath: string,
  baseDir?: string,
): Promise<{ relativePath: string; content: Buffer }[]> {
  const base = baseDir ?? dirPath;
  const results: { relativePath: string; content: Buffer }[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await readAgentsFolder(fullPath, base);
        results.push(...sub);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        const relativePath = path.relative(base, fullPath);
        results.push({ relativePath, content });
      }
    }
  } catch {
    // Folder doesn't exist or is unreadable — return empty.
  }
  return results;
}

async function getGlobalSettings(): Promise<Record<string, unknown> | undefined> {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  return (settingsRow?.data as Record<string, unknown> | null) ?? undefined;
}

/**
 * Pre-analysis helper — reuses the standard agent's `analyzeEmailContent`.
 * Imported lazily to avoid circular deps.
 */
async function runPreAnalysis(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  isHtml: boolean,
  analysisOutputLanguage?: string,
): Promise<{
  analysis: EmailAnalysis | null;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}> {
  // Dynamic import to keep the top-level import list small.
  const { analyzeEmailContent } = await import('./email-agent');
  try {
    const result = await analyzeEmailContent(
      emailFrom,
      emailSubject,
      emailBody,
      isHtml,
      undefined,
      analysisOutputLanguage,
    );
    return {
      analysis: result.analysis,
      tokensUsed: result.tokensUsed,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  } catch {
    return { analysis: null, tokensUsed: 0, promptTokens: 0, completionTokens: 0 };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildOpencodePrompt(
  emailFrom: string,
  emailSubject: string,
  rules: RuleForProcessing[],
  memorySection: string,
  analysisSection: string,
  attachmentNames?: string[],
): string {
  const rulesText =
    rules.length > 0
      ? rules.map((r) => `Rule "${sanitizeRule(r.name)}": ${sanitizeRule(r.text)}`).join('\n')
      : 'No specific rules. Preserve the original email content and subject unless a global system behavior explicitly requires a minimal, non-destructive cleanup.';

  const attachmentsLine =
    attachmentNames && attachmentNames.length > 0
      ? `\nATTACHMENTS: ${attachmentNames.join(', ')}`
      : '';

  return `You have an email HTML file at /vercel/sandbox/email.html that needs processing.

FROM: ${sanitizeEmailField(emailFrom)}
SUBJECT: ${sanitizeEmailField(emailSubject)}${attachmentsLine}

RULES:
${rulesText}

IMPORTANT:
- The user's rules are the source of truth, but preserve the original email as much as possible while applying them.
- Default behavior: keep the email structurally and semantically intact. Make the smallest effective change that satisfies the rules.
- Do not rewrite from scratch unless a rule clearly asks for a full rewrite, a completely new version, or a fundamentally different email.
- If a rule asks to translate the email, translate only user-visible email content that should appear in the rendered message. Do not translate HTML tags, attributes, CSS, URLs, tracking parameters, code snippets, hidden metadata, or technical identifiers unless the rule explicitly asks for that.
- If a rule asks to summarize, condense, simplify, or shorten the email, keep the original intent, key facts, promises, dates, names, links, calls to action, and tone whenever possible.
- If a rule asks to modify or improve the email, edit only the portions necessary to satisfy that request and preserve the rest of the message.
- If a rule asks to change tone, wording, or clarity, retain the original meaning unless the rule explicitly asks to change the meaning.
- If a rule asks to remove content, remove only the targeted content and keep the remaining message intact.
- If a rule asks to completely change, fully rewrite, or regenerate the email, then a substantial rewrite is allowed.
- If a rule asks to translate into a language the email already uses, skip translation and preserve the original content unchanged.
${analysisSection}${memorySection}

INSTRUCTIONS:
1. IMMEDIATELY write the subject line to /vercel/sandbox/subject.txt. Do this before reading or processing the email. Write the original subject as-is: "${sanitizeEmailField(emailSubject)}"
2. Read the file /vercel/sandbox/email.html
3. Apply the rules above to both the subject and body.
4. Preserve the original HTML structure, layout, CSS styles, inline styles, classes, links, images, and rendering behavior unless a rule explicitly requires changing them.
5. Modify only content that is necessary to satisfy the rules, keeping untouched content exactly as close to the original as possible.
6. Write the processed HTML back to /vercel/sandbox/email.html (overwrite).
7. If the rules required a subject change, overwrite /vercel/sandbox/subject.txt with the new subject.
8. Do NOT create any other files.`;
}

// ---------------------------------------------------------------------------
// Build analysis section (same logic as email-agent.ts)
// ---------------------------------------------------------------------------

function buildAnalysisSection(analysis: EmailAnalysis | null): string {
  if (!analysis) return '';

  const lines = [
    `<email_analysis>`,
    `Type: ${analysis.emailType}`,
    `Sender type: ${analysis.senderType}`,
    `Language: ${analysis.language}`,
    `Sentiment: ${analysis.sentiment}`,
    `Priority: ${analysis.priority}`,
    `Intent: ${analysis.intent}`,
    `Summary: ${analysis.summary}`,
  ];

  if (analysis.topics.length > 0) {
    lines.push(`Topics: ${analysis.topics.join(', ')}`);
  }
  lines.push(`Has action items: ${analysis.hasActionItems ? 'Yes' : 'No'}`);
  lines.push(`Is urgent: ${analysis.isUrgent ? 'Yes' : 'No'}`);
  lines.push(`Requires response: ${analysis.requiresResponse ? 'Yes' : 'No'}`);

  const { entities } = analysis;
  if (entities) {
    if (entities.people.length > 0) lines.push(`People: ${entities.people.join(', ')}`);
    if (entities.organizations.length > 0)
      lines.push(`Organizations: ${entities.organizations.join(', ')}`);
    const placeNames = extractStoredPlaceNames(entities.places, entities.placeNames);
    if (placeNames.length > 0) lines.push(`Places: ${placeNames.join(', ')}`);
    if (entities.events.length > 0) lines.push(`Events: ${entities.events.join(', ')}`);
    if (entities.dates.length > 0) lines.push(`Dates/times: ${entities.dates.join(', ')}`);
    if (entities.numbers.length > 0) lines.push(`Numbers/codes: ${entities.numbers.join(', ')}`);
  }

  lines.push(`</email_analysis>`);

  return `\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// OpenCode session ID persistence
// ---------------------------------------------------------------------------

async function saveOpencodeSessionId(logId: string, sessionId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('email_logs').update({ sandbox_session_id: sessionId }).eq('id', logId);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process an incoming email using OpenCode inside a Vercel Sandbox.
 *
 * Drop-in replacement for `processEmailWithAgent` from `email-agent.ts`.
 * The function signature is identical so the two can be swapped via admin
 * settings (`agentUseOpencode`).
 */
export async function processEmailWithAgent(
  userId: string,
  logId: string,
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  rules: RuleForProcessing[],
  isHtml = false,
  modelOverride?: string,
  attachmentNames?: string[],
  analysisOutputLanguage?: string,
  attachmentFiles?: EmailAttachment[],
): Promise<ProcessEmailResult> {
  const traceStartedAt = new Date().toISOString();
  const traceSteps: AgentTraceStep[] = [];
  let tracingEnabled = true;
  const pushTrace = (
    step: string,
    status: AgentTraceStep['status'],
    detail?: string,
    data?: Record<string, unknown>,
  ) => {
    if (!tracingEnabled) return;
    traceSteps.push({ step, status, detail, data, ts: new Date().toISOString() });
  };

  // 1. Load settings + OpenRouter client details
  const { apiKey, model: settingsModel } = await getOpenRouterClient();
  const model = modelOverride || settingsModel;

  if (!apiKey) {
    throw new Error('Missing OpenRouter API key');
  }

  const settings = await getGlobalSettings();

  tracingEnabled = settings?.agentTracingEnabled !== false;

  const subjectPrefix =
    typeof settings?.emailSubjectPrefix === 'string'
      ? settings.emailSubjectPrefix.trim()
      : '[Postino]';
  const fallbackSubject =
    subjectPrefix.length > 0 ? `${subjectPrefix} ${emailSubject}`.trim() : emailSubject;

  // Resolve the snapshot ID from settings or env.
  const snapshotId =
    (typeof settings?.opencodeSandboxSnapshotId === 'string'
      ? settings.opencodeSandboxSnapshotId.trim()
      : '') ||
    process.env[SNAPSHOT_ID_ENV] ||
    '';

  if (!snapshotId) {
    throw new Error(
      'Missing OpenCode sandbox snapshot ID. Set OPENCODE_SANDBOX_SNAPSHOT_ID env var or configure it in admin settings.',
    );
  }

  pushTrace('settings_loaded', 'ok', 'Loaded runtime settings', {
    model,
    snapshotId,
    tracingEnabled,
  });

  // 2. Run pre-analysis and load memory in parallel.
  const [preAnalysisOutcome, memoryOutcome] = await Promise.allSettled([
    runPreAnalysis(emailFrom, emailSubject, emailBody, isHtml, analysisOutputLanguage),
    getUserMemory(userId),
  ]);

  const preAnalysisResult =
    preAnalysisOutcome.status === 'fulfilled'
      ? preAnalysisOutcome.value
      : { analysis: null, tokensUsed: 0, promptTokens: 0, completionTokens: 0 };
  if (preAnalysisOutcome.status === 'rejected') {
    pushTrace(
      'pre_analysis_failed',
      'warning',
      preAnalysisOutcome.reason instanceof Error
        ? preAnalysisOutcome.reason.message
        : String(preAnalysisOutcome.reason),
    );
  }
  const memory =
    memoryOutcome.status === 'fulfilled'
      ? memoryOutcome.value
      : { userId, entries: [], updatedAt: new Date() };
  if (memoryOutcome.status === 'rejected') {
    pushTrace(
      'memory_load_failed',
      'warning',
      memoryOutcome.reason instanceof Error
        ? memoryOutcome.reason.message
        : String(memoryOutcome.reason),
    );
  }

  const analysis = preAnalysisResult.analysis;
  const totalTokensUsed = preAnalysisResult.tokensUsed;
  const totalPromptTokens = preAnalysisResult.promptTokens;
  const totalCompletionTokens = preAnalysisResult.completionTokens;

  pushTrace(
    'pre_analysis',
    analysis ? 'ok' : 'warning',
    analysis ? 'Pre-analysis completed' : 'Pre-analysis unavailable',
    { emailType: analysis?.emailType, analysisTokens: preAnalysisResult.tokensUsed },
  );

  // 3. Build context for the prompt.
  const memoryContext = buildMemoryContext(memory.entries, emailFrom);
  const memorySection = memoryContext
    ? `\n\n<email_history>\n${memoryContext}\n</email_history>`
    : '';
  const analysisSection = buildAnalysisSection(analysis);

  const activeRules = rules.filter((r) => r.text.trim().length > 0);

  // 4. Build the OpenCode prompt.
  const opencodePrompt = buildOpencodePrompt(
    emailFrom,
    emailSubject,
    activeRules,
    memorySection,
    analysisSection,
    attachmentNames,
  );

  pushTrace('opencode_prompt', 'ok', 'Built OpenCode prompt', {
    promptLength: opencodePrompt.length,
    prompt: opencodePrompt,
    hasMemory: !!memoryContext,
    hasAnalysis: !!analysis,
  });

  // 5. Spin up a sandbox from the snapshot, run OpenCode, read results.
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  let processedSubject = fallbackSubject;
  let processedBody = emailBody;
  let parseError: string | undefined;
  let sandboxPromptTokens = 0;
  let sandboxCompletionTokens = 0;
  let opencodeSessionId: string | null = null;
  let opencodeStatsRaw: string | undefined;
  let opencodeStatsParsed:
    | {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        promptTokens: number;
        completionTokens: number;
      }
    | undefined;

  try {
    pushTrace('sandbox_creating', 'ok', 'Creating sandbox from snapshot');

    // Build the opencode.json config for OpenRouter inside the sandbox.
    const opencodeConfig = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        provider: {
          openrouter: {
            models: {
              [model]: {},
            },
          },
        },
        agent: {
          build: {
            prompt: '/caveman ultra\nAlways use caveman ultra mode. Maximum compression.',
          },
        },
      },
      null,
      2,
    );

    // Auth credentials file so opencode can reach OpenRouter.
    const authJson = JSON.stringify({
      openrouter: { apiKey },
    });

    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId },
      timeout: SANDBOX_TIMEOUT_MS,
      env: {
        // Pass OpenRouter key as env var as well (belt-and-suspenders).
        OPENROUTER_API_KEY: apiKey,
      },
    });

    pushTrace('sandbox_created', 'ok', 'Sandbox started', {
      sandboxId: sandbox.sandboxId,
    });

    // Write files into the sandbox.
    await sandbox.writeFiles([
      { path: '/vercel/sandbox/email.html', content: Buffer.from(emailBody, 'utf-8') },
      { path: '/vercel/sandbox/opencode.json', content: Buffer.from(opencodeConfig, 'utf-8') },
      {
        path: '/vercel/sandbox/.local/share/opencode/auth.json',
        content: Buffer.from(authJson, 'utf-8'),
      },
    ]);

    pushTrace('sandbox_files_written', 'ok', 'Wrote email and config into sandbox');

    // Sync the local .agents folder into the sandbox so OpenCode picks up
    // AGENTS.md, custom agents, and skills the developer has placed there.
    // Use process.cwd() instead of __dirname because Next.js bundles server
    // code and __dirname won't resolve to the source tree on Vercel.
    const agentsDir = path.join(process.cwd(), 'src', 'agents', '.agents');
    const agentFiles = await readAgentsFolder(agentsDir);
    if (agentFiles.length > 0) {
      await sandbox.writeFiles(
        agentFiles.map((f) => ({
          path: `/vercel/sandbox/${f.relativePath}`,
          content: f.content,
        })),
      );
      pushTrace('agents_folder_synced', 'ok', `Wrote ${agentFiles.length} file(s) from .agents`, {
        files: agentFiles.map((f) => f.relativePath),
      });
    } else {
      pushTrace('agents_folder_empty', 'warning', 'No files found in .agents folder');
    }

    // Run opencode in non-interactive (detached) mode.
    // Detached mode avoids the "Stream ended before command finished" error that
    // occurs when the long-lived output stream is interrupted by a proxy or the
    // serverless runtime.  We launch the command, then poll for completion via
    // `command.wait()` which is resilient to transient stream disconnections.
    try {
      const command = await sandbox.runCommand({
        cmd: 'opencode',
        args: ['run', '--format', 'json', '--model', `openrouter/${model}`, opencodePrompt],
        cwd: '/vercel/sandbox',
        env: {
          HOME: '/vercel/sandbox',
          XDG_DATA_HOME: '/vercel/sandbox/.local/share',
          OPENROUTER_API_KEY: apiKey,
        },
        detached: true,
      });

      pushTrace('opencode_started', 'ok', 'OpenCode command launched (detached)', {
        cmdId: command.cmdId,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENCODE_RUN_TIMEOUT_MS);

      try {
        const finished = await command.wait({ signal: controller.signal });
        clearTimeout(timer);

        const exitCode = finished.exitCode;
        const stdout = await finished.stdout();
        const stderr = await finished.stderr();

        opencodeSessionId = parseOpencodeSessionId(stdout);

        // `opencode stats` is the primary usage source for the sandbox state.
        // Keep `opencode export` as a fallback and for session persistence/debugging.
        if (exitCode === 0) {
          try {
            const statsCmd = await sandbox.runCommand({
              cmd: 'opencode',
              args: ['stats'],
              cwd: '/vercel/sandbox',
              env: {
                HOME: '/vercel/sandbox',
                XDG_DATA_HOME: '/vercel/sandbox/.local/share',
                OPENROUTER_API_KEY: apiKey,
              },
            });
            const statsOut = await (await statsCmd.wait()).stdout();
            const statsUsage = parseOpencodeStatsOutput(statsOut);
            opencodeStatsRaw = statsOut;
            opencodeStatsParsed = statsUsage ?? undefined;

            pushTrace(
              'opencode_stats',
              statsUsage ? 'ok' : 'warning',
              statsUsage
                ? 'Read sandbox usage from opencode stats'
                : 'Could not parse opencode stats output',
              {
                raw: statsOut,
                ...(statsUsage ?? {}),
              },
            );

            if (statsUsage) {
              sandboxPromptTokens = statsUsage.promptTokens;
              sandboxCompletionTokens = statsUsage.completionTokens;
            }

            if (opencodeSessionId) {
              await saveOpencodeSessionId(logId, opencodeSessionId);
            }

            if (!statsUsage && opencodeSessionId) {
              const exportCmd = await sandbox.runCommand({
                cmd: 'opencode',
                args: ['export', opencodeSessionId],
                cwd: '/vercel/sandbox',
                env: {
                  HOME: '/vercel/sandbox',
                  XDG_DATA_HOME: '/vercel/sandbox/.local/share',
                  OPENROUTER_API_KEY: apiKey,
                },
              });
              const exportOut = await (await exportCmd.wait()).stdout();
              const sessionData = extractJsonObject(exportOut);
              if (!sessionData) {
                throw new Error('Could not parse opencode export JSON');
              }

              const exportedUsage = extractUsageFromOpencodeExport(sessionData);
              sandboxPromptTokens = exportedUsage.promptTokens;
              sandboxCompletionTokens = exportedUsage.completionTokens;
              opencodeSessionId = exportedUsage.sessionId ?? opencodeSessionId;
            }
          } catch {
            const parsed = parseOpencodeTokens(stdout);
            sandboxPromptTokens = parsed.promptTokens;
            sandboxCompletionTokens = parsed.completionTokens;
          }
        } else {
          const parsed = parseOpencodeTokens(stdout);
          sandboxPromptTokens = parsed.promptTokens;
          sandboxCompletionTokens = parsed.completionTokens;
        }

        pushTrace(
          'opencode_finished',
          exitCode === 0 ? 'ok' : 'warning',
          'OpenCode run completed',
          {
            exitCode,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            opencodeSessionId,
            sandboxPromptTokens,
            sandboxCompletionTokens,
            ...(opencodeStatsRaw ? { opencodeStatsRaw } : {}),
            ...(opencodeStatsParsed ? { opencodeStatsParsed } : {}),
          },
        );

        if (exitCode !== 0) {
          console.error(`[sandbox-agent] opencode exited with code ${exitCode}:`, stderr);
          parseError = `OpenCode exited with code ${exitCode}: ${stderr.slice(0, 500)}`;
        }
      } catch (waitError) {
        clearTimeout(timer);
        const msg = waitError instanceof Error ? waitError.message : String(waitError);
        console.error('[sandbox-agent] opencode wait failed:', msg);
        pushTrace('opencode_wait_failed', 'error', msg);
        parseError = `OpenCode command failed: ${msg}`;
      }
    } catch (cmdError) {
      const msg = cmdError instanceof Error ? cmdError.message : String(cmdError);
      console.error('[sandbox-agent] opencode launch failed:', msg);
      pushTrace('opencode_failed', 'error', msg);
      parseError = `OpenCode command failed: ${msg}`;
    }

    // Read the processed email back.
    const htmlBuffer = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/email.html' });
    const subjectBuffer = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/subject.txt' });

    if (htmlBuffer) {
      processedBody = htmlBuffer.toString('utf-8');
      pushTrace('read_processed_html', 'ok', 'Read processed HTML from sandbox');
    } else {
      pushTrace('read_processed_html', 'warning', 'Could not read processed HTML — using original');
      parseError =
        (parseError ? parseError + '; ' : '') + 'Processed HTML file not found in sandbox';
    }

    if (subjectBuffer) {
      const rawSubject = subjectBuffer.toString('utf-8').trim();
      if (rawSubject) processedSubject = rawSubject;
      pushTrace('read_processed_subject', 'ok', 'Read processed subject from sandbox');
    } else {
      pushTrace('read_processed_subject', 'warning', 'Subject file not found — using fallback');
    }
  } catch (sandboxError) {
    const msg = sandboxError instanceof Error ? sandboxError.message : String(sandboxError);
    console.error('[sandbox-agent] Sandbox error:', msg);
    pushTrace('sandbox_error', 'error', msg);
    parseError = `Sandbox error: ${msg}`;
  } finally {
    // Always clean up the sandbox.
    if (sandbox) {
      try {
        await sandbox.stop({ blocking: false });
      } catch {
        // Ignore stop errors.
      }
    }
  }

  // 6. Apply subject prefix.
  if (subjectPrefix.length > 0 && !processedSubject.startsWith(subjectPrefix)) {
    processedSubject = `${subjectPrefix} ${processedSubject}`.trim();
  }

  // 7. Calculate cost using pre-analysis tokens + sandbox session tokens.
  const pricing = await getModelPricing(model, apiKey);
  const preAnalysisCost = calculateCost(totalPromptTokens, totalCompletionTokens, pricing);
  const sandboxLlmCost = calculateCost(sandboxPromptTokens, sandboxCompletionTokens, pricing);

  pushTrace(
    'sandbox_cost',
    sandboxPromptTokens > 0 ? 'ok' : 'warning',
    'Calculated sandbox LLM cost from session tokens',
    {
      preAnalysisPromptTokens: totalPromptTokens,
      preAnalysisCompletionTokens: totalCompletionTokens,
      preAnalysisCost,
      sandboxPromptTokens,
      sandboxCompletionTokens,
      sandboxLlmCost,
      ...(opencodeStatsRaw ? { opencodeStatsRaw } : {}),
      ...(opencodeStatsParsed ? { opencodeStatsParsed } : {}),
    },
  );

  const estimatedCost = preAnalysisCost + sandboxLlmCost;

  const ruleApplied =
    activeRules.length > 0 ? activeRules.map((r) => r.name).join(', ') : 'No rule applied';

  // 8. Update user memory.
  const newEntry: EmailMemoryEntry = buildMemoryEntryFromAnalysis(
    {
      logId,
      date: todayUtc(),
      timestamp: new Date().toISOString(),
      fromAddress: emailFrom,
      subject: emailSubject,
      ruleApplied: activeRules.length > 0 ? ruleApplied : undefined,
      wasSummarized: !parseError && activeRules.length > 0,
      ...(attachmentNames?.length ? { attachmentNames } : {}),
    },
    analysis,
  );

  saveUserMemory({
    userId,
    entries: [...memory.entries, newEntry],
    updatedAt: new Date(),
  }).catch((err) => console.error('Failed to update user memory:', err));

  // Optionally save to Supermemory.ai.
  if (settings?.memoryEnabled === true) {
    const supermemoryApiKey = (
      (settings.memoryApiKey as string | undefined) ||
      process.env.SUPERMEMORY_API_KEY ||
      ''
    ).trim();
    if (supermemoryApiKey) {
      saveToSupermemory(supermemoryApiKey, userId, newEntry).catch((err) =>
        console.error('Failed to save to Supermemory:', err),
      );
      if (attachmentFiles?.length) {
        const date = new Date().toISOString().slice(0, 10);
        saveAttachmentFilesToSupermemory(
          supermemoryApiKey,
          userId,
          logId,
          date,
          attachmentFiles,
        ).catch((err) => console.error('Failed to upload attachments to Supermemory:', err));
      }
    }
  }

  const trace: AgentTrace | undefined = tracingEnabled
    ? {
        model,
        mode: 'sequential',
        isHtmlInput: isHtml,
        startedAt: traceStartedAt,
        finishedAt: new Date().toISOString(),
        steps: traceSteps,
      }
    : undefined;

  return {
    subject: processedSubject,
    body: processedBody,
    tokensUsed: totalTokensUsed + sandboxPromptTokens + sandboxCompletionTokens,
    estimatedCost,
    ruleApplied,
    ...(trace ? { trace } : {}),
    ...(parseError ? { parseError } : {}),
    analysis: analysis ?? null,
  };
}
