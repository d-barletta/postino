/**
 * sandbox-email-agent.ts — OpenCode Sandbox-based email processing agent.
 *
 * OpenCode-based agent that edits HTML inside a Vercel Sandbox. This avoids hitting
 * model context-window limits for very large emails because OpenCode manages
 * its own context autonomously.
 *
 * The agent:
 *   1. Loads settings, pre-analyses the email, and provisions an on-demand
 *      memory tool for the sandbox when available.
 *   2. Spins up a Vercel Sandbox from a pre-built snapshot that has OpenCode
 *      installed (`opencode-ai`).
 *   3. Writes the email HTML + an `opencode.json` config (pointing at the
 *      configured OpenRouter model) into the sandbox filesystem.
 *   4. Runs `opencode run` with a prompt that embeds the user's rules.
 *   5. Reads the modified email HTML back from the sandbox.
 *   6. Stores the OpenCode session ID in the `email_logs` row for later
 *      recovery / debugging.
 *
 * This module exposes the canonical `processEmailWithAgent` entrypoint.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Sandbox } from '@vercel/sandbox';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getOpenRouterClient,
  buildOpenRouterChatCompletionTrackingFields,
  buildOpenRouterHeaders,
  getModelPricing,
  calculateCost,
  type AgentTrace,
  type AgentTraceStep,
  type OpenRouterTrackingContext,
} from '@/lib/openrouter';
import type { ProcessEmailResult, RuleForProcessing } from '@/lib/openrouter';
import type { EmailAnalysis, EmailMemoryEntry, PreComputedEmailAnalysis } from '@/types';
import type { EmailAttachment } from '@/lib/email';
import { extractStoredPlaceNames } from '@/lib/place-utils';
import {
  buildMemoryEntryFromAnalysis,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
} from './email-agent';
import {
  buildSandboxEmailAgentPrompt,
  buildSandboxEmailAgentVerificationPrompt,
} from './sandbox-email-agent-prompt-builder';
import {
  createSandboxMemoryToolToken,
  resolveSandboxMemoryToolBaseUrl,
} from '@/lib/sandbox-memory-tool';
import { VERCEL_TIMEOUTS } from '@/lib/vercel-plan';

// Re-export memory helpers so consumers can import from either agent module.
export {
  buildMemoryEntryFromAnalysis,
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

/** Platform-level hard cap for a sandbox execution. */
const SANDBOX_PLATFORM_TIMEOUT_MS = VERCEL_TIMEOUTS.sandboxPlatformTimeoutMs;

/** Max time (ms) the sandbox is allowed to run before we kill it. */
const SANDBOX_TIMEOUT_MS = VERCEL_TIMEOUTS.sandboxTimeoutMs;

/** Max time (ms) we wait for the `opencode run` command. */
const OPENCODE_RUN_TIMEOUT_MS = VERCEL_TIMEOUTS.opencodeRunTimeoutMs;

/** Max time (ms) for the optional verification/correction pass. */
const OPENCODE_VERIFY_TIMEOUT_MS = VERCEL_TIMEOUTS.opencodeVerifyTimeoutMs;

const OPENCODE_RUN_LOG_PATH = '/vercel/sandbox/opencode-run.log';
const OPENCODE_VERIFY_LOG_PATH = '/vercel/sandbox/opencode-verify.log';
const SANDBOX_EMAIL_HTML_PATH = '/vercel/sandbox/email.html';
const SANDBOX_SUBJECT_PATH = '/vercel/sandbox/subject.txt';
const SANDBOX_PROCESSING_RESULT_PATH = '/vercel/sandbox/processing_result.json';
const DEFAULT_PROCESSING_RESULT_JSON = '{"forward":true}';
const TRACE_TEXT_EXCERPT_MAX_CHARS = 2000;
const TRACE_TEXT_TAIL_MAX_CHARS = 4000;
const TRACE_CONSOLE_TEXT_MAX_CHARS = 320;

const OPENCODE_SKILLS = ['caveman', 'html-email-editing'] as const;

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

function parseSubjectWithForwardingDecision(rawSubjectFile: string): {
  subject: string;
  shouldForward?: boolean;
  skipForwardReason?: string;
} {
  const normalized = rawSubjectFile.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { subject: '' };

  const lines = normalized.split('\n');
  const firstLine = (lines[0] ?? '').trim();
  // Marker format:
  //   [POSTINO_FORWARD=YES]
  //   [POSTINO_FORWARD=NO] optional reason...
  // Capture group 1 = YES|NO, capture group 2 = optional reason text.
  const markerMatch = firstLine.match(/^\[POSTINO_FORWARD=(YES|NO)\](?:\s+(.*))?$/i);

  if (!markerMatch) {
    return { subject: normalized };
  }

  const shouldForward = markerMatch[1]?.toUpperCase() === 'YES';
  const reason = (markerMatch[2] ?? '').trim();
  const subject = lines.slice(1).join('\n').trim();

  return {
    subject,
    shouldForward,
    ...(!shouldForward && reason ? { skipForwardReason: reason } : {}),
  };
}

function parseProcessingResultFile(rawResultFile: string): {
  shouldForward?: boolean;
  skipForwardReason?: string;
} {
  const normalized = rawResultFile.trim();
  if (!normalized) return {};

  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const shouldForward =
      typeof parsed.forward === 'boolean'
        ? parsed.forward
        : typeof parsed.shouldForward === 'boolean'
          ? parsed.shouldForward
          : undefined;

    const rawSkipReason =
      typeof parsed.skipReason === 'string'
        ? parsed.skipReason
        : typeof parsed.skipForwardReason === 'string'
          ? parsed.skipForwardReason
          : typeof parsed.reason === 'string'
            ? parsed.reason
            : '';
    const skipForwardReason = rawSkipReason.trim();

    return {
      ...(shouldForward !== undefined ? { shouldForward } : {}),
      ...(shouldForward === false && skipForwardReason ? { skipForwardReason } : {}),
    };
  } catch {
    return {};
  }
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
    const regex = new RegExp(`[|│]\\s*${label.replace(/ /g, '\\s+')}\\s+([^\\s|│]+)\\s*[|│]`, 'i');
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

function excerptForTrace(text: string, maxLen = TRACE_TEXT_EXCERPT_MAX_CHARS): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated ${text.length - maxLen} chars]`;
}

function tailExcerptForTrace(text: string, maxLen = TRACE_TEXT_TAIL_MAX_CHARS): string {
  if (text.length <= maxLen) return text;
  return `[truncated ${text.length - maxLen} chars]\n${text.slice(-maxLen)}`;
}

function sanitizeTraceValueForConsole(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return excerptForTrace(value, TRACE_CONSOLE_TEXT_MAX_CHARS);
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((item) => sanitizeTraceValueForConsole(item, depth + 1));
    if (value.length > 8) {
      items.push(`... (${value.length - 8} more items)`);
    }
    return items;
  }

  if (value && typeof value === 'object') {
    if (depth >= 2) return '[object]';

    const entries = Object.entries(value as Record<string, unknown>);
    const limited = entries
      .slice(0, 10)
      .map(([key, entryValue]) => [key, sanitizeTraceValueForConsole(entryValue, depth + 1)]);
    const result = Object.fromEntries(limited) as Record<string, unknown>;
    if (entries.length > 10) {
      result.__truncated__ = `${entries.length - 10} more keys`;
    }
    return result;
  }

  return value;
}

function summarizeTextForTrace(text: string, includeExcerpt: boolean): Record<string, unknown> {
  return {
    length: text.length,
    ...(includeExcerpt
      ? {
          excerpt: excerptForTrace(text),
          tailExcerpt: tailExcerptForTrace(text),
        }
      : {}),
  };
}

async function readSandboxTextFile(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  filePath: string,
): Promise<string | null> {
  try {
    const buffer = await sandbox.readFileToBuffer({ path: filePath });
    return buffer ? buffer.toString('utf-8') : null;
  } catch {
    return null;
  }
}

async function readSandboxTextSnapshot(
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>,
  filePath: string,
  includeExcerpt: boolean,
): Promise<Record<string, unknown>> {
  const text = await readSandboxTextFile(sandbox, filePath);
  if (text === null) {
    return {
      path: filePath,
      exists: false,
    };
  }

  return {
    path: filePath,
    exists: true,
    ...summarizeTextForTrace(text, includeExcerpt),
  };
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

function getOpencodeSkillToggles(
  settings: Record<string, unknown> | undefined,
): Record<string, boolean> {
  const defaults = Object.fromEntries(OPENCODE_SKILLS.map((skill) => [skill, true])) as Record<
    string,
    boolean
  >;
  const raw = settings?.opencodeSkillToggles;
  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Record<string, unknown>;
  const normalized: Record<string, boolean> = { ...defaults };
  for (const skill of OPENCODE_SKILLS) {
    if (typeof value[skill] === 'boolean') {
      normalized[skill] = value[skill] as boolean;
    }
  }
  return normalized;
}

function isOpencodeSkillEnabled(
  skillToggles: Record<string, boolean>,
  skillName: (typeof OPENCODE_SKILLS)[number],
): boolean {
  return skillToggles[skillName] !== false;
}

function isKnownOpencodeSkillName(
  skillName: string,
): skillName is (typeof OPENCODE_SKILLS)[number] {
  return OPENCODE_SKILLS.includes(skillName as (typeof OPENCODE_SKILLS)[number]);
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
  openRouterTracking?: OpenRouterTrackingContext,
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
      openRouterTracking,
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
  skillToggles: Record<string, boolean>,
  appendedSystemPrompt: string,
  attachmentNames?: string[],
  memoryToolEnabled = false,
): string {
  return buildSandboxEmailAgentPrompt({
    emailFrom,
    emailSubject,
    rules,
    appendedSystemPrompt,
    memorySection,
    memoryToolEnabled,
    analysisSection,
    skillToggles,
    attachmentNames,
    sandboxPlatformTimeoutMinutes: Math.round(SANDBOX_PLATFORM_TIMEOUT_MS / 60000),
  });
}

// ---------------------------------------------------------------------------
// Verification prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the prompt for the second (verification) OpenCode pass.
 * The email.html in the sandbox already contains the first-pass output.
 * This prompt asks OpenCode to re-check that every applicable rule was fully
 * applied and to fix anything that was missed or only partially done.
 */
function buildVerificationPrompt(
  emailFrom: string,
  emailSubject: string,
  rules: RuleForProcessing[],
  skillToggles: Record<string, boolean>,
  appendedSystemPrompt: string,
): string {
  return buildSandboxEmailAgentVerificationPrompt({
    emailFrom,
    emailSubject,
    rules,
    appendedSystemPrompt,
    skillToggles,
  });
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
 * Primary processing entrypoint used by inbound and reprocess flows.
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
  preComputedAnalysis?: PreComputedEmailAnalysis | null,
  openRouterUserEmail?: string,
): Promise<ProcessEmailResult> {
  const openRouterTracking = {
    userId: openRouterUserEmail,
    sessionId: logId,
  } satisfies OpenRouterTrackingContext;
  const traceStartedAt = new Date().toISOString();
  const traceSteps: AgentTraceStep[] = [];
  let tracingEnabled = true;
  let includeTraceExcerpts = false;
  const pushTrace = (
    step: string,
    status: AgentTraceStep['status'],
    detail?: string,
    data?: Record<string, unknown>,
  ) => {
    const ts = new Date().toISOString();
    const entry = { step, status, detail, data, ts };

    if (tracingEnabled) {
      traceSteps.push(entry);
    }

    const message = `[sandbox-agent][${logId}][${step}]${detail ? ` ${detail}` : ''}`;
    const consoleData = data
      ? (sanitizeTraceValueForConsole(data) as Record<string, unknown>)
      : undefined;

    if (status === 'error') {
      console.error(message, consoleData ?? '');
    } else if (status === 'warning') {
      console.warn(message, consoleData ?? '');
    } else {
      console.log(message, consoleData ?? '');
    }
  };

  // 1. Load settings + OpenRouter client details
  const { apiKey, model: settingsModel } = await getOpenRouterClient(openRouterTracking);
  const model = modelOverride || settingsModel;

  if (!apiKey) {
    throw new Error('Missing OpenRouter API key');
  }

  const settings = await getGlobalSettings();
  const skillToggles = getOpencodeSkillToggles(settings);

  tracingEnabled = settings?.agentTracingEnabled !== false;
  includeTraceExcerpts = tracingEnabled && settings?.agentTraceIncludeExcerpts === true;

  const subjectPrefix =
    typeof settings?.emailSubjectPrefix === 'string'
      ? settings.emailSubjectPrefix.trim()
      : '[Postino]';
  const appendedSystemPrompt =
    typeof settings?.llmSystemPrompt === 'string' ? settings.llmSystemPrompt.trim() : '';
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
    includeTraceExcerpts,
    subjectPrefix,
    skillToggles,
    hasAppendedSystemPrompt: appendedSystemPrompt.length > 0,
  });

  const sandboxMemoryToolBaseUrl = resolveSandboxMemoryToolBaseUrl();
  const sandboxMemoryToolToken = createSandboxMemoryToolToken({
    userId,
    logId,
    userEmail: openRouterUserEmail,
  });
  const memoryToolEnabled = Boolean(sandboxMemoryToolBaseUrl && sandboxMemoryToolToken);

  pushTrace(
    'memory_tool',
    memoryToolEnabled ? 'ok' : 'warning',
    memoryToolEnabled
      ? 'Enabled sandbox memory tool'
      : 'Sandbox memory tool unavailable; continuing without memory context',
    {
      hasBaseUrl: !!sandboxMemoryToolBaseUrl,
      hasToken: !!sandboxMemoryToolToken,
      baseUrl: sandboxMemoryToolBaseUrl || undefined,
    },
  );

  // 2. Run pre-analysis.
  //    When a preComputedAnalysis is provided (single-job path), skip the LLM
  //    call entirely and reuse the already-saved result.
  let preAnalysisResult: {
    analysis: EmailAnalysis | null;
    tokensUsed: number;
    promptTokens: number;
    completionTokens: number;
  };

  if (preComputedAnalysis) {
    pushTrace('pre_analysis', 'ok', 'Reusing pre-computed analysis (skipping LLM call)', {
      emailType: preComputedAnalysis.analysis?.emailType,
    });
    preAnalysisResult = {
      analysis: preComputedAnalysis.analysis,
      tokensUsed: preComputedAnalysis.tokensUsed,
      promptTokens: preComputedAnalysis.promptTokens,
      completionTokens: preComputedAnalysis.completionTokens,
    };
  } else {
    try {
      preAnalysisResult = await runPreAnalysis(
        emailFrom,
        emailSubject,
        emailBody,
        isHtml,
        analysisOutputLanguage,
        openRouterTracking,
      );
    } catch (error) {
      pushTrace(
        'pre_analysis_failed',
        'warning',
        error instanceof Error ? error.message : String(error),
      );
      preAnalysisResult = {
        analysis: null,
        tokensUsed: 0,
        promptTokens: 0,
        completionTokens: 0,
      };
    }
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
  const memorySection = '';
  const analysisSection = buildAnalysisSection(analysis);

  const activeRules = rules.filter((r) => r.text.trim().length > 0);

  pushTrace('rules_selected', 'ok', 'Prepared sandbox inputs', {
    activeRuleCount: activeRules.length,
    activeRuleNames: activeRules.map((rule) => rule.name),
    attachmentCount: attachmentNames?.length ?? 0,
    isHtmlInput: isHtml,
    emailBodyLength: emailBody.length,
    memoryMode: memoryToolEnabled ? 'tool' : 'none',
    memoryEntryCount: 0,
    memoryContextLength: 0,
    analysisSectionLength: analysisSection.length,
  });

  // 4. Build the OpenCode prompt.
  const opencodePrompt = buildOpencodePrompt(
    emailFrom,
    emailSubject,
    activeRules,
    memorySection,
    analysisSection,
    skillToggles,
    appendedSystemPrompt,
    attachmentNames,
    memoryToolEnabled,
  );

  pushTrace('opencode_prompt', 'ok', 'Built OpenCode prompt', {
    promptLength: opencodePrompt.length,
    promptSummary: summarizeTextForTrace(opencodePrompt, includeTraceExcerpts),
    hasMemory: false,
    hasMemoryTool: memoryToolEnabled,
    hasAnalysis: !!analysis,
  });

  // 5. Spin up a sandbox from the snapshot, run OpenCode, read results.
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  let processedSubject = fallbackSubject;
  let processedBody = emailBody;
  let parseError: string | undefined;
  let parseErrorCode: ProcessEmailResult['parseErrorCode'] | undefined;
  let shouldForward: boolean | undefined;
  let skipForwardReason: string | undefined;
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
    const trackingHeaders = buildOpenRouterHeaders(openRouterTracking);
    const trackingBody = buildOpenRouterChatCompletionTrackingFields(openRouterTracking);
    const opencodeModelId = `openrouter/${model}`;
    const opencodeConfig = JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        model: opencodeModelId,
        small_model: opencodeModelId,
        provider: {
          openrouter: {
            options: {
              ...(Object.keys(trackingHeaders).length > 0 ? { headers: trackingHeaders } : {}),
              ...(Object.keys(trackingBody).length > 0 ? { body: trackingBody } : {}),
            },
            models: {
              [model]: {},
            },
          },
        },
        ...(isOpencodeSkillEnabled(skillToggles, 'caveman')
          ? {
              agent: {
                build: {
                  prompt: '/caveman ultra\nAlways use caveman ultra mode. Maximum compression.',
                },
              },
            }
          : {}),
      },
      null,
      2,
    );

    // Auth credentials file so opencode can reach OpenRouter.
    const authJson = JSON.stringify({
      openrouter: { apiKey },
    });

    pushTrace('sandbox_inputs_prepared', 'ok', 'Prepared sandbox payloads', {
      emailHtmlBytes: Buffer.byteLength(emailBody, 'utf-8'),
      promptBytes: Buffer.byteLength(opencodePrompt, 'utf-8'),
      opencodeConfigBytes: Buffer.byteLength(opencodeConfig, 'utf-8'),
      authJsonBytes: Buffer.byteLength(authJson, 'utf-8'),
      opencodeModelId,
    });

    sandbox = await Sandbox.create({
      source: { type: 'snapshot', snapshotId },
      timeout: SANDBOX_TIMEOUT_MS,
      env: {
        // Pass OpenRouter key as env var as well (belt-and-suspenders).
        OPENROUTER_API_KEY: apiKey,
        OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
        OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
        POSTINO_INTERNAL_BASE_URL: sandboxMemoryToolBaseUrl,
        POSTINO_MEMORY_TOOL_TOKEN: sandboxMemoryToolToken ?? '',
      },
    });

    pushTrace('sandbox_created', 'ok', 'Sandbox started', {
      sandboxId: sandbox.sandboxId,
      sandboxTimeoutMs: SANDBOX_TIMEOUT_MS,
    });

    // Write files into the sandbox.
    await sandbox.writeFiles([
      { path: SANDBOX_EMAIL_HTML_PATH, content: Buffer.from(emailBody, 'utf-8') },
      { path: SANDBOX_SUBJECT_PATH, content: Buffer.from(emailSubject, 'utf-8') },
      {
        path: SANDBOX_PROCESSING_RESULT_PATH,
        content: Buffer.from(DEFAULT_PROCESSING_RESULT_JSON, 'utf-8'),
      },
      { path: '/vercel/sandbox/prompt.txt', content: Buffer.from(opencodePrompt, 'utf-8') },
      { path: '/vercel/sandbox/opencode.json', content: Buffer.from(opencodeConfig, 'utf-8') },
      {
        path: '/vercel/sandbox/.local/share/opencode/auth.json',
        content: Buffer.from(authJson, 'utf-8'),
      },
    ]);

    pushTrace('sandbox_files_written', 'ok', 'Wrote email and config into sandbox', {
      files: [
        SANDBOX_EMAIL_HTML_PATH,
        SANDBOX_SUBJECT_PATH,
        SANDBOX_PROCESSING_RESULT_PATH,
        '/vercel/sandbox/prompt.txt',
        '/vercel/sandbox/opencode.json',
        '/vercel/sandbox/.local/share/opencode/auth.json',
      ],
    });

    // Sync the local .agents folder into the sandbox so OpenCode picks up
    // AGENTS.md, custom agents, and skills the developer has placed there.
    // Use process.cwd() instead of __dirname because Next.js bundles server
    // code and __dirname won't resolve to the source tree on Vercel.
    const agentsDir = path.join(process.cwd(), 'src', 'agents', '.agents');
    const agentFiles = await readAgentsFolder(agentsDir);
    const allowedSkillNames = new Set(
      OPENCODE_SKILLS.filter((skill) => isOpencodeSkillEnabled(skillToggles, skill)),
    );
    const filteredAgentFiles = agentFiles.filter((file) => {
      const normalizedPath = file.relativePath.split(path.sep).join('/');
      const match = normalizedPath.match(/^\.opencode\/skills\/([^/]+)\//);
      if (!match) return true;
      if (!isKnownOpencodeSkillName(match[1])) return false;
      return allowedSkillNames.has(match[1]);
    });
    if (filteredAgentFiles.length > 0) {
      await sandbox.writeFiles(
        filteredAgentFiles.map((f) => ({
          path: `/vercel/sandbox/${f.relativePath}`,
          content: f.content,
        })),
      );
      pushTrace(
        'agents_folder_synced',
        'ok',
        `Wrote ${filteredAgentFiles.length} file(s) from .agents`,
        {
          files: filteredAgentFiles.map((f) => f.relativePath),
          disabledSkills: OPENCODE_SKILLS.filter(
            (skill) => !isOpencodeSkillEnabled(skillToggles, skill),
          ),
        },
      );
    } else {
      pushTrace(
        'agents_folder_empty',
        'warning',
        agentFiles.length > 0
          ? 'No .agents files were synced after applying skill toggles'
          : 'No files found in .agents folder',
      );
    }

    // Run opencode in non-interactive (detached) mode.
    // Detached mode avoids the "Stream ended before command finished" error that
    // occurs when the long-lived output stream is interrupted by a proxy or the
    // serverless runtime.  We launch the command, then poll for completion via
    // `command.wait()` which is resilient to transient stream disconnections.
    try {
      const opencodeRunStartedAt = Date.now();
      const command = await sandbox.runCommand({
        cmd: 'bash',
        args: [
          '-lc',
          `set -o pipefail; opencode run --format json --model "$OPENCODE_MODEL" "$(cat /vercel/sandbox/prompt.txt)" 2>&1 | tee ${OPENCODE_RUN_LOG_PATH}`,
        ],
        cwd: '/vercel/sandbox',
        env: {
          HOME: '/vercel/sandbox',
          XDG_DATA_HOME: '/vercel/sandbox/.local/share',
          OPENROUTER_API_KEY: apiKey,
          OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
          OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
          OPENCODE_MODEL: opencodeModelId,
          POSTINO_INTERNAL_BASE_URL: sandboxMemoryToolBaseUrl,
          POSTINO_MEMORY_TOOL_TOKEN: sandboxMemoryToolToken ?? '',
        },
        detached: true,
      });

      pushTrace('opencode_started', 'ok', 'OpenCode command launched (detached)', {
        cmdId: command.cmdId,
        timeoutMs: OPENCODE_RUN_TIMEOUT_MS,
        liveLogPath: OPENCODE_RUN_LOG_PATH,
        cwd: '/vercel/sandbox',
      });

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, OPENCODE_RUN_TIMEOUT_MS);

      try {
        const finished = await command.wait({ signal: controller.signal });
        clearTimeout(timer);

        const exitCode = finished.exitCode;
        const stdout = await finished.stdout();
        const stderr = await finished.stderr();
        const runLogSnapshot = await readSandboxTextSnapshot(
          sandbox,
          OPENCODE_RUN_LOG_PATH,
          includeTraceExcerpts,
        );

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
                OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
                OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
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
                  OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
                  OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
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
            durationMs: Date.now() - opencodeRunStartedAt,
            exitCode,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            ...(includeTraceExcerpts
              ? {
                  stdoutExcerpt: excerptForTrace(stdout),
                  stdoutTail: tailExcerptForTrace(stdout),
                  stderrExcerpt: excerptForTrace(stderr),
                }
              : {}),
            runLog: runLogSnapshot,
            opencodeSessionId,
            sandboxPromptTokens,
            sandboxCompletionTokens,
            ...(opencodeStatsRaw ? { opencodeStatsRaw } : {}),
            ...(opencodeStatsParsed ? { opencodeStatsParsed } : {}),
          },
        );

        if (exitCode !== 0) {
          console.error(`[sandbox-agent] opencode exited with code ${exitCode}:`, stderr);
          const stderrSummary =
            stderr.trim() ||
            (runLogSnapshot.exists ? String(runLogSnapshot.tailExcerpt ?? '') : '');
          parseError = `OpenCode exited with code ${exitCode}: ${stderrSummary.slice(0, 500)}`;
        }
      } catch (waitError) {
        clearTimeout(timer);
        const msg = waitError instanceof Error ? waitError.message : String(waitError);
        console.error('[sandbox-agent] opencode wait failed:', msg);
        const [runLogSnapshot, subjectSnapshot, processingResultSnapshot] = sandbox
          ? await Promise.all([
              readSandboxTextSnapshot(sandbox, OPENCODE_RUN_LOG_PATH, includeTraceExcerpts),
              readSandboxTextSnapshot(sandbox, SANDBOX_SUBJECT_PATH, includeTraceExcerpts),
              readSandboxTextSnapshot(
                sandbox,
                SANDBOX_PROCESSING_RESULT_PATH,
                includeTraceExcerpts,
              ),
            ])
          : [
              { path: OPENCODE_RUN_LOG_PATH, exists: false },
              { path: SANDBOX_SUBJECT_PATH, exists: false },
              { path: SANDBOX_PROCESSING_RESULT_PATH, exists: false },
            ];
        if (timedOut) {
          const timeoutMsg = `OpenCode timed out after ${Math.round(OPENCODE_RUN_TIMEOUT_MS / 60000)} minutes; original email was forwarded without AI rewrite`;
          pushTrace('opencode_timeout', 'error', timeoutMsg, {
            durationMs: Date.now() - opencodeRunStartedAt,
            waitError: msg,
            runLog: runLogSnapshot,
            subjectSnapshot,
            processingResultSnapshot,
          });
          parseError = timeoutMsg;
          parseErrorCode = 'forwarded_without_ai_rewrite_timeout';
        } else {
          pushTrace('opencode_wait_failed', 'error', msg, {
            durationMs: Date.now() - opencodeRunStartedAt,
            runLog: runLogSnapshot,
            subjectSnapshot,
            processingResultSnapshot,
          });
          parseError = `OpenCode command failed: ${msg}`;
        }
      }
    } catch (cmdError) {
      const msg = cmdError instanceof Error ? cmdError.message : String(cmdError);
      console.error('[sandbox-agent] opencode launch failed:', msg);
      pushTrace('opencode_failed', 'error', msg);
      parseError = `OpenCode command failed: ${msg}`;
    }

    // Read the processed email back.
    const htmlBuffer = await sandbox.readFileToBuffer({ path: SANDBOX_EMAIL_HTML_PATH });
    const subjectBuffer = await sandbox.readFileToBuffer({ path: SANDBOX_SUBJECT_PATH });
    const processingResultBuffer = await sandbox.readFileToBuffer({
      path: SANDBOX_PROCESSING_RESULT_PATH,
    });

    if (htmlBuffer) {
      processedBody = htmlBuffer.toString('utf-8');
      pushTrace('read_processed_html', 'ok', 'Read processed HTML from sandbox', {
        processedHtml: summarizeTextForTrace(processedBody, includeTraceExcerpts),
      });
    } else {
      pushTrace('read_processed_html', 'warning', 'Could not read processed HTML — using original');
      parseError =
        (parseError ? parseError + '; ' : '') + 'Processed HTML file not found in sandbox';
    }

    if (subjectBuffer) {
      const rawSubject = subjectBuffer.toString('utf-8');
      const parsedSubject = parseSubjectWithForwardingDecision(rawSubject);
      if (parsedSubject.subject) processedSubject = parsedSubject.subject;
      pushTrace('read_processed_subject', 'ok', 'Read processed subject from sandbox', {
        processedSubject,
      });
      // Legacy fallback: accept decision markers from subject.txt only if JSON decision
      // output is unavailable, to preserve compatibility with older sandbox outputs.
      if (!processingResultBuffer && parsedSubject.shouldForward !== undefined) {
        shouldForward = parsedSubject.shouldForward;
        skipForwardReason = parsedSubject.skipForwardReason;
        pushTrace(
          'read_processed_subject_legacy_decision',
          'warning',
          'Using legacy subject marker decision because processing_result.json is missing',
          {
            shouldForward: shouldForward ?? null,
            skipForwardReason: skipForwardReason ?? null,
          },
        );
      }
    } else {
      pushTrace('read_processed_subject', 'warning', 'Subject file not found — using fallback');
    }

    if (processingResultBuffer) {
      const rawProcessingResult = processingResultBuffer.toString('utf-8');
      const parsedProcessingResult = parseProcessingResultFile(rawProcessingResult);
      if (parsedProcessingResult.shouldForward !== undefined) {
        shouldForward = parsedProcessingResult.shouldForward;
        skipForwardReason = parsedProcessingResult.skipForwardReason;
      }
      pushTrace('read_processing_result', 'ok', 'Read processing decision JSON from sandbox', {
        shouldForward: shouldForward ?? null,
        skipForwardReason: skipForwardReason ?? null,
      });
    } else {
      pushTrace(
        'read_processing_result',
        'warning',
        'Processing decision file not found — defaulting to forward',
      );
    }

    // Optional verification pass: re-run OpenCode to check all rules were fully applied.
    const runVerification =
      settings?.opencodeVerificationPass === true &&
      activeRules.length > 0 &&
      !parseError &&
      htmlBuffer !== null;

    if (runVerification) {
      pushTrace('opencode_verify_start', 'ok', 'Starting verification pass', {
        timeoutMs: OPENCODE_VERIFY_TIMEOUT_MS,
        liveLogPath: OPENCODE_VERIFY_LOG_PATH,
      });
      try {
        const verifyPrompt = buildVerificationPrompt(
          emailFrom,
          emailSubject,
          activeRules,
          skillToggles,
          appendedSystemPrompt,
        );

        pushTrace('opencode_verify_prompt', 'ok', 'Built verification prompt', {
          promptSummary: summarizeTextForTrace(verifyPrompt, includeTraceExcerpts),
        });

        // Write the verification prompt to the sandbox filesystem.
        await sandbox!.writeFiles([
          { path: '/vercel/sandbox/prompt.txt', content: Buffer.from(verifyPrompt, 'utf-8') },
        ]);

        const verifyStartedAt = Date.now();

        const verifyCommand = await sandbox!.runCommand({
          cmd: 'bash',
          args: [
            '-lc',
            `set -o pipefail; opencode run --format json --model "$OPENCODE_MODEL" "$(cat /vercel/sandbox/prompt.txt)" 2>&1 | tee ${OPENCODE_VERIFY_LOG_PATH}`,
          ],
          cwd: '/vercel/sandbox',
          env: {
            HOME: '/vercel/sandbox',
            XDG_DATA_HOME: '/vercel/sandbox/.local/share',
            OPENROUTER_API_KEY: apiKey,
            OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
            OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
            OPENCODE_MODEL: opencodeModelId,
            POSTINO_INTERNAL_BASE_URL: sandboxMemoryToolBaseUrl,
            POSTINO_MEMORY_TOOL_TOKEN: sandboxMemoryToolToken ?? '',
          },
          detached: true,
        });

        const verifyController = new AbortController();
        const verifyTimer = setTimeout(() => verifyController.abort(), OPENCODE_VERIFY_TIMEOUT_MS);

        try {
          const verifyFinished = await verifyCommand.wait({ signal: verifyController.signal });
          clearTimeout(verifyTimer);

          const verifyExitCode = verifyFinished.exitCode;
          const verifyStdout = await verifyFinished.stdout();
          const verifyStderr = await verifyFinished.stderr();
          const verifyLogSnapshot = await readSandboxTextSnapshot(
            sandbox!,
            OPENCODE_VERIFY_LOG_PATH,
            includeTraceExcerpts,
          );

          // Accumulate token usage from the verification pass.
          if (verifyExitCode === 0) {
            try {
              const verifyStatsCmd = await sandbox!.runCommand({
                cmd: 'opencode',
                args: ['stats'],
                cwd: '/vercel/sandbox',
                env: {
                  HOME: '/vercel/sandbox',
                  XDG_DATA_HOME: '/vercel/sandbox/.local/share',
                  OPENROUTER_API_KEY: apiKey,
                  OPENROUTER_USER_ID: openRouterTracking.userId ?? '',
                  OPENROUTER_SESSION_ID: openRouterTracking.sessionId ?? '',
                },
              });
              const verifyStatsOut = await (await verifyStatsCmd.wait()).stdout();
              const verifyStatsUsage = parseOpencodeStatsOutput(verifyStatsOut);
              if (verifyStatsUsage) {
                sandboxPromptTokens += verifyStatsUsage.promptTokens;
                sandboxCompletionTokens += verifyStatsUsage.completionTokens;
              } else {
                const parsed = parseOpencodeTokens(verifyStdout);
                sandboxPromptTokens += parsed.promptTokens;
                sandboxCompletionTokens += parsed.completionTokens;
              }
            } catch {
              const parsed = parseOpencodeTokens(verifyStdout);
              sandboxPromptTokens += parsed.promptTokens;
              sandboxCompletionTokens += parsed.completionTokens;
            }
          } else {
            const parsed = parseOpencodeTokens(verifyStdout);
            sandboxPromptTokens += parsed.promptTokens;
            sandboxCompletionTokens += parsed.completionTokens;
          }

          pushTrace(
            'opencode_verify_finished',
            verifyExitCode === 0 ? 'ok' : 'warning',
            'Verification pass completed',
            {
              durationMs: Date.now() - verifyStartedAt,
              exitCode: verifyExitCode,
              stdoutLength: verifyStdout.length,
              stderrLength: verifyStderr.length,
              ...(includeTraceExcerpts
                ? {
                    stdoutExcerpt: excerptForTrace(verifyStdout),
                    stdoutTail: tailExcerptForTrace(verifyStdout),
                    stderrExcerpt: excerptForTrace(verifyStderr),
                  }
                : {}),
              verifyLog: verifyLogSnapshot,
            },
          );

          if (verifyExitCode === 0) {
            // Read back the (potentially corrected) files.
            const verifyHtmlBuffer = await sandbox!.readFileToBuffer({
              path: SANDBOX_EMAIL_HTML_PATH,
            });
            const verifySubjectBuffer = await sandbox!.readFileToBuffer({
              path: SANDBOX_SUBJECT_PATH,
            });
            const verifyProcessingResultBuffer = await sandbox!.readFileToBuffer({
              path: SANDBOX_PROCESSING_RESULT_PATH,
            });

            if (verifyHtmlBuffer) {
              processedBody = verifyHtmlBuffer.toString('utf-8');
              pushTrace('opencode_verify_html', 'ok', 'Read verified HTML from sandbox', {
                verifiedHtml: summarizeTextForTrace(processedBody, includeTraceExcerpts),
              });
            }
            if (verifySubjectBuffer) {
              const rawVerifySubject = verifySubjectBuffer.toString('utf-8');
              const parsedVerifySubject = parseSubjectWithForwardingDecision(rawVerifySubject);
              if (parsedVerifySubject.subject) processedSubject = parsedVerifySubject.subject;
              pushTrace('opencode_verify_subject', 'ok', 'Read verified subject from sandbox', {
                processedSubject,
              });
              if (!verifyProcessingResultBuffer && parsedVerifySubject.shouldForward !== undefined) {
                shouldForward = parsedVerifySubject.shouldForward;
                skipForwardReason = parsedVerifySubject.skipForwardReason;
                pushTrace(
                  'opencode_verify_subject_legacy_decision',
                  'warning',
                  'Using legacy subject marker decision because processing_result.json is missing',
                  {
                    shouldForward: shouldForward ?? null,
                    skipForwardReason: skipForwardReason ?? null,
                  },
                );
              }
            }

            if (verifyProcessingResultBuffer) {
              const rawVerifyProcessingResult = verifyProcessingResultBuffer.toString('utf-8');
              const parsedVerifyProcessingResult =
                parseProcessingResultFile(rawVerifyProcessingResult);
              if (parsedVerifyProcessingResult.shouldForward !== undefined) {
                shouldForward = parsedVerifyProcessingResult.shouldForward;
                skipForwardReason = parsedVerifyProcessingResult.skipForwardReason;
              }
              pushTrace(
                'opencode_verify_processing_result',
                'ok',
                'Read verified processing decision JSON from sandbox',
                {
                  shouldForward: shouldForward ?? null,
                  skipForwardReason: skipForwardReason ?? null,
                },
              );
            }
          } else {
            console.error(
              `[sandbox-agent] verification pass exited with code ${verifyExitCode}:`,
              verifyStderr,
            );
            pushTrace(
              'opencode_verify_error',
              'warning',
              `Verification pass exited with code ${verifyExitCode} — using first-pass output`,
            );
          }
        } catch (verifyWaitError) {
          clearTimeout(verifyTimer);
          const msg =
            verifyWaitError instanceof Error ? verifyWaitError.message : String(verifyWaitError);
          console.error('[sandbox-agent] verification pass wait failed:', msg);
          const verifyLogSnapshot = await readSandboxTextSnapshot(
            sandbox!,
            OPENCODE_VERIFY_LOG_PATH,
            includeTraceExcerpts,
          );
          pushTrace(
            'opencode_verify_timeout',
            'warning',
            `Verification pass timed out or failed: ${msg} — using first-pass output`,
            {
              verifyLog: verifyLogSnapshot,
            },
          );
        }
      } catch (verifyErr) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error('[sandbox-agent] verification pass launch failed:', msg);
        pushTrace(
          'opencode_verify_launch_failed',
          'warning',
          `Verification pass could not start: ${msg} — using first-pass output`,
        );
      }
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
        pushTrace('sandbox_stopped', 'ok', 'Stopped sandbox', {
          sandboxId: sandbox.sandboxId,
        });
      } catch {
        // Ignore stop errors.
        pushTrace('sandbox_stop_failed', 'warning', 'Failed to stop sandbox cleanly');
      }
    }
  }

  // 6. Apply subject prefix.
  // Apply subject prefix only when forwarding remains enabled.
  if (
    shouldForward !== false &&
    subjectPrefix.length > 0 &&
    !processedSubject.startsWith(subjectPrefix)
  ) {
    processedSubject = `${subjectPrefix} ${processedSubject}`.trim();
    pushTrace('subject_prefixed', 'ok', 'Applied configured subject prefix', {
      processedSubject,
    });
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

  pushTrace('result_ready', 'ok', 'Prepared sandbox agent result', {
    processedSubject,
    processedBodyLength: processedBody.length,
    ruleApplied,
    parseError: parseError || null,
    parseErrorCode: parseErrorCode || null,
    shouldForward: shouldForward ?? null,
    skipForwardReason: skipForwardReason ?? null,
    totalTokensUsed: totalTokensUsed + sandboxPromptTokens + sandboxCompletionTokens,
    estimatedCost,
  });

  // 8. Persist memory to Supermemory.
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

  const supermemoryApiKey = (
    (settings?.memoryApiKey as string | undefined) ||
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
    ...(shouldForward !== undefined ? { shouldForward } : {}),
    ...(skipForwardReason ? { skipForwardReason } : {}),
    ...(trace ? { trace } : {}),
    ...(parseError ? { parseError } : {}),
    ...(parseErrorCode ? { parseErrorCode } : {}),
    analysis: analysis ?? null,
  };
}
