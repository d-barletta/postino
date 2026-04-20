import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EmailAnalysis } from '@/types';

export interface ProcessEmailResult {
  subject: string;
  body: string;
  tokensUsed: number;
  estimatedCost: number;
  ruleApplied: string;
  /** When false, caller should skip forwarding this email. Missing/undefined means forward by default. */
  shouldForward?: boolean;
  /** Optional agent-provided reason explaining why forwarding was skipped. */
  skipForwardReason?: string;
  parseError?: string;
  parseErrorCode?: 'forwarded_without_ai_rewrite_timeout';
  trace?: AgentTrace;
  /** Structured AI pre-analysis result for this email. */
  analysis?: EmailAnalysis | null;
}

export interface AgentTraceStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  detail?: string;
  data?: Record<string, unknown>;
  ts: string;
}

export interface AgentTrace {
  model: string;
  mode: 'sequential' | 'parallel';
  isHtmlInput: boolean;
  startedAt: string;
  finishedAt: string;
  steps: AgentTraceStep[];
}

/** Pricing for a specific model (USD per token). */
export interface ModelPricing {
  promptCostPerToken: number;
  completionCostPerToken: number;
}

// In-memory cache for model pricing to avoid repeated API calls.
const modelPricingCache = new Map<string, { pricing: ModelPricing; fetchedAt: number }>();
const PRICING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the pricing for a specific model from the OpenRouter models endpoint.
 * Results are cached in memory for one hour.
 * Returns null if pricing information cannot be retrieved.
 */
export async function getModelPricing(model: string, apiKey: string): Promise<ModelPricing | null> {
  const cached = modelPricingCache.get(model);
  if (cached && Date.now() - cached.fetchedAt < PRICING_CACHE_TTL_MS) {
    return cached.pricing;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://postino.pro',
        'X-Title': 'Postino Email Redirector',
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: Array<{
        id?: string;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };

    const modelData = payload.data?.find((m) => m.id === model);
    if (!modelData?.pricing) return null;

    const pricing: ModelPricing = {
      promptCostPerToken: parseFloat(modelData.pricing.prompt || '0') || 0,
      completionCostPerToken: parseFloat(modelData.pricing.completion || '0') || 0,
    };

    modelPricingCache.set(model, { pricing, fetchedAt: Date.now() });
    return pricing;
  } catch (err) {
    console.warn('[openrouter] Failed to fetch model pricing for', model, ':', err);
    return null;
  }
}

/**
 * Calculates the real cost for a generation using model-specific pricing.
 * Falls back to a fixed approximate rate if pricing information is unavailable.
 */
export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  pricing: ModelPricing | null,
): number {
  if (!pricing) {
    // Fallback: approximate cost at $0.30/M tokens when live pricing is unavailable.
    return ((promptTokens + completionTokens) / 1_000_000) * 0.3;
  }
  return (
    promptTokens * pricing.promptCostPerToken + completionTokens * pricing.completionCostPerToken
  );
}

export interface OpenRouterTrackingContext {
  userId?: string | null;
  sessionId?: string | null;
}

function normalizeTrackingValue(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveOpenRouterTrackingContext(tracking?: OpenRouterTrackingContext): {
  userId?: string;
  sessionId?: string;
} {
  const userId = normalizeTrackingValue(tracking?.userId);
  const sessionId = normalizeTrackingValue(tracking?.sessionId);
  return {
    ...(userId ? { userId } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function getDefaultOpenRouterHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://postino.pro',
    'X-Title': 'Postino Email Redirector',
  };
}

export function buildOpenRouterHeaders(
  tracking?: OpenRouterTrackingContext,
): Record<string, string> {
  const resolved = resolveOpenRouterTrackingContext(tracking);
  return {
    ...getDefaultOpenRouterHeaders(),
    ...(resolved.userId ? { 'X-OpenRouter-User-Id': resolved.userId } : {}),
    ...(resolved.sessionId ? { 'x-session-id': resolved.sessionId } : {}),
  };
}

/**
 * Builds OpenRouter-compatible chat-completion tracking fields.
 * Includes `user` and `session_id` only when non-empty values are available.
 */
export function buildOpenRouterChatCompletionTrackingFields(tracking?: OpenRouterTrackingContext): {
  user?: string;
  session_id?: string;
} {
  const resolved = resolveOpenRouterTrackingContext(tracking);
  return {
    ...(resolved.userId ? { user: resolved.userId } : {}),
    ...(resolved.sessionId ? { session_id: resolved.sessionId } : {}),
  };
}

export function buildOpenRouterProviderOptions(
  tracking?: OpenRouterTrackingContext,
): { openai: { user?: string; metadata?: Record<string, string> } } | undefined {
  const resolved = resolveOpenRouterTrackingContext(tracking);
  if (!resolved.userId && !resolved.sessionId) return undefined;
  return {
    openai: {
      ...(resolved.userId ? { user: resolved.userId } : {}),
      ...(resolved.sessionId
        ? {
            metadata: {
              session_id: resolved.sessionId,
            },
          }
        : {}),
    },
  };
}

export async function getOpenRouterClient(tracking?: OpenRouterTrackingContext): Promise<{
  client: OpenAI;
  model: string;
  apiKey: string;
}> {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = (settingsRow?.data as Record<string, unknown> | null) ?? null;

  const apiKey =
    (typeof settings?.llmApiKey === 'string' ? settings.llmApiKey : '') ||
    process.env.OPEN_ROUTER_API_KEY ||
    '';
  const model =
    (typeof settings?.llmModel === 'string' ? settings.llmModel.trim() : '') ||
    process.env.LLM_MODEL?.trim() ||
    '';
  if (!model) {
    throw new Error('LLM model is not configured. Please set it in Admin → Settings.');
  }
  const normalizedApiKey = apiKey.trim();

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: normalizedApiKey,
    defaultHeaders: buildOpenRouterHeaders(tracking),
  });

  return { client, model, apiKey: normalizedApiKey };
}

/**
 * Sanitizes a user-defined rule to reduce prompt injection risk.
 * - Strips XML/HTML-like tags that could break structural delimiters
 * - Removes ASCII control characters
 * - Collapses runs of whitespace so multi-line injections are flattened
 */
export function sanitizeRule(rule: string): string {
  return (
    rule
      // Remove XML/HTML-like tags (e.g. </user_rules>, <system>, etc.)
      .replace(/<[^>]*>/g, '')
      // Remove ASCII control characters (except space/tab which are handled next)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Collapse runs of whitespace / newlines so multi-line injections are flattened
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Sanitizes a single-line email header field (FROM / SUBJECT) for safe inclusion
 * in the LLM prompt.
 * - Encodes angle brackets as HTML entities to prevent structural-delimiter injection
 * - Removes ASCII control characters including CR / LF
 * - Collapses whitespace so multi-line injections are flattened into a single line
 */
export function sanitizeEmailField(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RuleForProcessing {
  id: string;
  name: string;
  text: string;
}

/** Backoff delays (ms) for transient LLM API failures. */
const LLM_RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;

/** HTTP status codes that are considered transient and worth retrying. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Returns true when the given error looks like a transient failure that is safe
 * to retry (rate-limit, server error, network timeout, etc.).
 */
function isRetryableLlmError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // OpenAI SDK wraps HTTP errors with a `status` property
  const status = (err as Record<string, unknown>).status;
  if (typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status)) return true;
  // Network / timeout errors from the underlying fetch
  const message = (err as Error).message || '';
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(message)) return true;
  return false;
}

/**
 * Invokes `fn` with exponential backoff retry on transient failures.
 * Non-transient errors are re-thrown immediately.
 * Exported for use in other modules that call the LLM API directly.
 */
export async function withLlmRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= LLM_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < LLM_RETRY_DELAYS_MS.length && isRetryableLlmError(err)) {
        const delay = LLM_RETRY_DELAYS_MS[attempt];
        console.warn(
          `[openrouter] ${label} failed (attempt ${attempt + 1}), retrying in ${delay}ms`,
          err,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
