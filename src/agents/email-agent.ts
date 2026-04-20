/**
 * email-agent.ts - Shared analysis and memory utilities.
 *
 * This module provides:
 *   1. Email pre-analysis/classification (`analyzeEmailContent`) used by inbound
 *      processing and admin analysis endpoints.
 *   2. Supermemory persistence helpers for saving analysis summaries and
 *      attachment documents per user.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildEmailAgentAnalysisSystemPrompt,
  buildEmailAgentAnalysisPrompt,
} from './email-agent-prompt-builder';
import {
  sanitizeEmailField,
  buildOpenRouterHeaders,
  buildOpenRouterProviderOptions,
  getOpenRouterClient,
  getModelPricing,
  calculateCost,
  type OpenRouterTrackingContext,
} from '@/lib/openrouter';
import type { EmailAnalysis, EmailMemoryEntry } from '@/types';
import { geocodePlaceNames } from '@/lib/place-geocoding';
import {
  extractStoredPlaceNames,
  normalizeUniqueStrings,
  normalizeUniqueNumberStrings,
} from '@/lib/place-utils';
import * as cheerio from 'cheerio';
import Supermemory, { toFile } from 'supermemory';
import type { EmailAttachment } from '@/lib/email';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max output tokens for the pre-analysis classification call. */
const ANALYSIS_MAX_TOKENS = 2_000;

/** Default max body characters included in pre-analysis.
 * HTML emails are reduced to reader-friendly structured text before this limit
 * is applied so the AI sees more useful content within the same token budget.
 */
const BODY_ANALYSIS_MAX_CHARS = 30_000;

async function getGlobalSettings(): Promise<Record<string, unknown> | undefined> {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  return (settingsRow?.data as Record<string, unknown> | null) ?? undefined;
}

interface AgentRuntimeSettings {
  analysisMaxTokens: number;
  bodyAnalysisMaxChars: number;
}

interface AnalyzeEmailContentResult {
  analysis: EmailAnalysis | null;
  extractedBody: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  model: string;
}

function normalizeUsageTotals(
  usage:
    | {
        totalTokens?: number | undefined;
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
      }
    | null
    | undefined,
): { totalTokens: number; promptTokens: number; completionTokens: number } {
  const totalTokens = usage?.totalTokens ?? 0;
  let promptTokens = usage?.inputTokens ?? 0;
  let completionTokens = usage?.outputTokens ?? 0;

  if (totalTokens > 0 && promptTokens + completionTokens === 0) {
    promptTokens = totalTokens;
  } else if (totalTokens > 0 && promptTokens + completionTokens < totalTokens) {
    const missing = totalTokens - (promptTokens + completionTokens);
    if (promptTokens <= completionTokens) promptTokens += missing;
    else completionTokens += missing;
  }

  return { totalTokens, promptTokens, completionTokens };
}

type RawEmailAnalysis = Omit<EmailAnalysis, 'entities'> & {
  entities: Omit<EmailAnalysis['entities'], 'places' | 'placeNames'> & {
    places: string[];
  };
};

function pickPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function resolveAgentRuntimeSettings(
  settings: Record<string, unknown> | undefined,
): AgentRuntimeSettings {
  return {
    analysisMaxTokens: pickPositiveInt(settings?.agentAnalysisMaxTokens, ANALYSIS_MAX_TOKENS),
    bodyAnalysisMaxChars: pickPositiveInt(
      settings?.agentBodyAnalysisMaxChars,
      BODY_ANALYSIS_MAX_CHARS,
    ),
  };
}
// ---------------------------------------------------------------------------
// Memory helpers
// ---------------------------------------------------------------------------

/**
 * Build an EmailMemoryEntry from core metadata and an optional EmailAnalysis result.
 * All callers that construct a memory entry should use this to stay consistent.
 */
export function buildMemoryEntryFromAnalysis(
  core: {
    logId: string;
    date: string;
    timestamp: string;
    fromAddress: string;
    subject: string;
    ruleApplied?: string;
    wasSummarized: boolean;
    attachmentNames?: string[];
  },
  analysis?: EmailAnalysis | null,
): EmailMemoryEntry {
  return {
    ...core,
    ...(analysis?.summary ? { summary: analysis.summary } : {}),
    ...(analysis?.emailType ? { emailType: analysis.emailType } : {}),
    ...(analysis?.language ? { language: analysis.language } : {}),
    ...(analysis?.sentiment ? { sentiment: analysis.sentiment } : {}),
    ...(analysis?.priority ? { priority: analysis.priority } : {}),
    ...(analysis?.topics?.length ? { topics: analysis.topics } : {}),
    ...(analysis?.intent ? { intent: analysis.intent } : {}),
    ...(analysis?.senderType ? { senderType: analysis.senderType } : {}),
    ...(analysis?.requiresResponse !== undefined
      ? { requiresResponse: analysis.requiresResponse }
      : {}),
    ...(analysis?.prices?.length ? { prices: analysis.prices } : {}),
    ...(analysis?.entities
      ? {
          entities: {
            places: analysis.entities.placeNames,
            events: analysis.entities.events,
            dates: analysis.entities.dates,
            people: analysis.entities.people,
            organizations: analysis.entities.organizations,
            numbers: analysis.entities.numbers,
          },
        }
      : {}),
  };
}

/**
 * Save an email memory entry to Supermemory.ai, scoped to the given user.
 */
export async function saveToSupermemory(
  apiKey: string,
  userId: string,
  entry: EmailMemoryEntry,
): Promise<void> {
  const client = new Supermemory({ apiKey });
  // containerTag is derived from the verified email-owner's UID so every
  // memory entry is scoped exclusively to that user's partition in Supermemory.
  // The search path enforces the same tag, preventing cross-user data access.
  const containerTag = `user_${userId}`;

  const parts: string[] = [
    `From: ${entry.fromAddress}`,
    `Subject: ${entry.subject}`,
    `Date: ${entry.date}`,
  ];
  if (entry.logId) parts.push(`PostinoEmailID: ${entry.logId}`);
  if (entry.summary) parts.push(`Summary: ${entry.summary}`);
  if (entry.emailType) parts.push(`Type: ${entry.emailType}`);
  if (entry.language) parts.push(`Language: ${entry.language}`);
  if (entry.sentiment) parts.push(`Sentiment: ${entry.sentiment}`);
  if (entry.priority) parts.push(`Priority: ${entry.priority}`);
  if (entry.intent) parts.push(`Intent: ${entry.intent}`);
  if (entry.senderType) parts.push(`Sender type: ${entry.senderType}`);
  if (entry.topics?.length) parts.push(`Topics: ${entry.topics.join(', ')}`);
  if (entry.ruleApplied) parts.push(`Rule applied: ${entry.ruleApplied}`);
  if (entry.wasSummarized) parts.push(`Was summarized: yes`);
  if (entry.requiresResponse) parts.push(`Requires response: yes`);
  if (entry.entities?.people?.length) parts.push(`People: ${entry.entities.people.join(', ')}`);
  if (entry.entities?.organizations?.length)
    parts.push(`Organizations: ${entry.entities.organizations.join(', ')}`);
  if (entry.entities?.places?.length) parts.push(`Places: ${entry.entities.places.join(', ')}`);
  if (entry.entities?.events?.length) parts.push(`Events: ${entry.entities.events.join(', ')}`);
  if (entry.entities?.dates?.length) parts.push(`Dates: ${entry.entities.dates.join(', ')}`);
  if (entry.entities?.numbers?.length)
    parts.push(`Numbers/codes: ${entry.entities.numbers.join(', ')}`);
  if (entry.prices?.length) parts.push(`Prices: ${entry.prices.join(', ')}`);
  if (entry.attachmentNames?.length) parts.push(`Attachments: ${entry.attachmentNames.join(', ')}`);

  await client.add({
    content: parts.join('\n'),
    metadata: { logId: entry.logId, date: entry.date }, // <-- add metadata here
    containerTag,
  });
}

/**
 * Upload attachment files to Supermemory.ai as documents, scoped to the given user.
 * Each file is uploaded with the logId and date as metadata for traceability.
 * Errors are logged and swallowed so a failed upload never blocks email processing.
 */
export async function saveAttachmentFilesToSupermemory(
  apiKey: string,
  userId: string,
  logId: string,
  date: string,
  attachments: EmailAttachment[],
): Promise<void> {
  const client = new Supermemory({ apiKey });
  const containerTag = `user_${userId}`;
  const metadata = JSON.stringify({ logId, date });

  await Promise.allSettled(
    attachments.map(async (att) => {
      try {
        const file = await toFile(att.content, att.filename, { type: att.contentType });
        const uploadParams: Parameters<typeof client.documents.uploadFile>[0] = {
          file,
          containerTags: JSON.stringify([containerTag]),
          metadata,
        };
        if (att.contentType === 'application/pdf') {
          uploadParams.fileType = 'pdf';
        } else if (att.contentType.startsWith('image/')) {
          uploadParams.fileType = 'image';
          uploadParams.mimeType = att.contentType;
        }
        await client.documents.uploadFile(uploadParams);
        console.log(`[supermemory] uploaded attachment "${att.filename}" for logId ${logId}`);
      } catch (err) {
        console.error(
          `[supermemory] failed to upload attachment "${att.filename}" for logId ${logId}:`,
          err,
        );
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// HTML normalization helpers
// ---------------------------------------------------------------------------

/**
 * Strips HTML tags to produce plain text used by the fallback extraction path.
 */
function stripHtmlForExtraction(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Pre-analysis (email classification + summarisation)
// ---------------------------------------------------------------------------

/**
 * Zod schema for the lightweight pre-analysis pass that runs before rule application.
 * Captures classification, enrichment tags, sentiment, language, intent and priority
 * so that rule-application passes have richer context and results can be stored for
 * future reference.
 */
const emailAnalysisSchema = z.object({
  emailType: z
    .enum([
      'newsletter',
      'transactional',
      'promotional',
      'personal',
      'notification',
      'automated',
      'other',
    ])
    .describe('The primary category of this email'),
  summary: z
    .string()
    .describe(
      'A 1-2 sentence summary of what this email is about. Focus on the actual content, not the metadata.',
    ),
  topics: z.array(z.string()).describe('Key topics or themes mentioned in the email'),
  hasActionItems: z
    .boolean()
    .describe(
      'True if this email requests or requires action from the recipient (e.g. click, reply, verify, purchase)',
    ),
  isUrgent: z
    .boolean()
    .describe('True if this email is explicitly marked as urgent or time-sensitive'),
  requiresResponse: z
    .boolean()
    .describe(
      'True if this email explicitly or implicitly expects a direct reply from the recipient (e.g. asks a question, requests confirmation, or awaits feedback)',
    ),
  language: z
    .string()
    .describe(
      'ISO 639-1 language code of the email body (e.g. "en" for English, "it" for Italian, "es" for Spanish)',
    ),
  sentiment: z
    .enum(['positive', 'neutral', 'negative'])
    .describe('Overall emotional tone of the email'),
  priority: z
    .enum(['low', 'normal', 'high', 'critical'])
    .describe('Processing priority inferred from content and urgency signals'),
  intent: z
    .string()
    .describe(
      'Concise description of the sender\'s primary intent (e.g. "Confirming order", "Requesting payment", "Promoting product", "Sharing update")',
    ),
  senderType: z
    .enum(['human', 'automated', 'business', 'newsletter'])
    .describe(
      'Characterises who sent the email: human (individual person), automated (system/bot), business (company communication), newsletter (subscription content)',
    ),
  entities: z
    .object({
      places: z
        .array(z.string())
        .describe(
          'Only physical or geographic locations that are explicitly and unambiguously mentioned in the email (for example cities, countries, full street addresses, airports, stations, or clearly identified venues). Be conservative: include a place only when you are confident it refers to a real-world location. Do not guess. Do not include browsers, operating systems, time zones, standalone postal codes, short ambiguous abbreviations, product names, generic business names, or terms that might be organizations/topics instead of locations. If unsure, return an empty array entry for that item by omitting it.',
        ),
      events: z
        .array(z.string())
        .describe(
          'Events mentioned in the email (meetings, conferences, deadlines, appointments, etc.)',
        ),
      dates: z
        .array(z.string())
        .describe(
          'Specific dates, times, or time references mentioned in the email (e.g. "12 Nov 2025", "13 May", "Friday Jan 30, 2026", "3pm CET", "12pm – 12:30pm Central European Time - Rome"). Include timezone references like "CET", "Central European Time" or "UTC+1" as part of the date/time entry rather than as a separate place. Use a consistent format: prefer "Day Mon Year" for dates (e.g. "12 Nov 2025") and include time and timezone in the same entry when present (e.g. "30 Jan 2026 12:00–12:30 CET"). Deduplicate entries that refer to the same date/time.',
        ),
      people: z
        .array(z.string())
        .describe('Names of people mentioned in the email (senders, recipients, contacts, etc.)'),
      organizations: z
        .array(z.string())
        .describe('Company, brand, or organization names mentioned in the email'),
      numbers: z
        .array(z.string())
        .describe(
          'Labelled numeric codes and identifiers found in the visible text of the email: phone numbers, credit card numbers, client IDs, order codes, account numbers, tracking codes, etc. Each entry must be formatted as "<label> <number>" where the label describes what the number represents and the number itself is written without spaces, hyphens, or other separators (e.g. "telefono +390212345678", "codice carta 134533", "numero cliente 98765", "tracking IT123456789IT"). Do NOT include postal/ZIP codes (already captured in places), monetary amounts with a currency symbol (captured in prices), or dates (captured in dates). Do NOT extract numbers from URLs, query-string parameters, path segments, or any href/src attributes — URLs must be treated as atomic and their internal numeric parts ignored. Deduplicate: if the same number appears in multiple formats, include it only once.',
        ),
    })
    .describe('Named entities extracted from the email content'),
  prices: z
    .array(z.string())
    .optional()
    .describe(
      'Prices, costs, or monetary amounts explicitly stated in the email. Each entry must include the currency symbol and amount in a consistent format: use the currency symbol immediately before the number (e.g. "$19.99", "€50", "£9.99/month", "€500 discount", "¥1200"). For free/no-cost offers use "free". Do NOT include vague descriptions without a number (e.g. "discounted price"). Do NOT duplicate amounts that appear multiple times. These are monetary values and must NOT appear in the numbers/codes list.',
    ),
});

// This schema describes the raw LLM output before place geocoding enriches the persisted analysis.

/** Returned by `preAnalyzeEmail`; groups the analysis result with its token costs. */
interface PreAnalysisResult {
  analysis: RawEmailAnalysis | null;
  extractedBody: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Lightweight pre-analysis pass: classifies the email and generates a short content
 * summary before the heavier rule-application passes run.
 *
 * The result is used to:
 *   1. Inject an `<email_analysis>` context block into each rule-application system prompt.
 *   2. Persist enriched metadata (type, summary, language, sentiment, priority, tags,
 *      intent, senderType) in the user's memory so future processing has richer history context.
 *   3. Store the full analysis on the email log document for downstream inspection.
 *
 * Failures are soft-caught; a `null` result means the main processing continues
 * without the analysis context rather than aborting entirely.
 */
function normalizeInlineStyle(style: string | undefined): string {
  return style?.toLowerCase().replace(/\s+/g, '') ?? '';
}

function removeHiddenEmailNodes($: cheerio.CheerioAPI): void {
  $('[aria-hidden="true"], [hidden]').remove();

  $('[style]').each((_, element) => {
    const style = normalizeInlineStyle($(element).attr('style'));
    if (!style) return;

    const isDisplayNone = style.includes('display:none');
    const isVisibilityHidden = style.includes('visibility:hidden');
    const isMsoHidden = style.includes('mso-hide:all');
    const hasHiddenOverflow = style.includes('overflow:hidden');
    const hasCollapsedBounds =
      style.includes('max-height:0') ||
      style.includes('max-height:1px') ||
      style.includes('height:0') ||
      style.includes('height:1px') ||
      style.includes('max-width:0') ||
      style.includes('max-width:1px') ||
      style.includes('width:0') ||
      style.includes('width:1px');
    const hasInvisibleText =
      style.includes('opacity:0') ||
      style.includes('font-size:0') ||
      style.includes('font-size:1px') ||
      style.includes('line-height:0') ||
      style.includes('line-height:1px') ||
      style.includes('color:transparent');
    const isVisuallyCollapsed = hasInvisibleText && hasCollapsedBounds && hasHiddenOverflow;

    if (isDisplayNone || isVisibilityHidden || isMsoHidden || isVisuallyCollapsed) {
      $(element).remove();
    }
  });

  $('img').each((_, element) => {
    const width = Number.parseInt($(element).attr('width') ?? '', 10);
    const height = Number.parseInt($(element).attr('height') ?? '', 10);
    const style = normalizeInlineStyle($(element).attr('style'));
    const isTrackingPixel =
      (Number.isFinite(width) &&
        width > 0 &&
        width <= 1 &&
        Number.isFinite(height) &&
        height > 0 &&
        height <= 1) ||
      ((style.includes('width:1px') || style.includes('max-width:1px')) &&
        (style.includes('height:1px') || style.includes('max-height:1px')));

    if (isTrackingPixel) {
      $(element).remove();
    }
  });
}

function htmlFragmentToMarkdownish(html: string): string {
  const $ = cheerio.load(html);

  $('script, style, noscript, svg, canvas, meta, link, head, iframe, title, base').remove();
  removeHiddenEmailNodes($);

  $('br').replaceWith('\n');

  // Horizontal rules become visible separators rather than silent blank lines.
  $('hr').replaceWith('\n---\n');

  $('img').each((_, element) => {
    const alt = $(element).attr('alt')?.trim();
    $(element).replaceWith(alt ? `[Image: ${alt}]` : '');
  });

  // Anchors: emit "label (url)" when a link has both visible text and an href
  // so the AI can see the destination (useful for CTA links, unsubscribe links,
  // etc.).  When only visible text is present (no href) emit just the text.
  // Links with no visible text at all (e.g. image-only tracking pixels) are
  // dropped entirely to avoid noise.
  $('a').each((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    const href = $(element).attr('href')?.trim() ?? '';
    const replacement = text && href ? `${text} (${href})` : text;
    $(element).replaceWith(replacement);
  });

  // Heading hierarchy markers give the AI structural context so it can tell
  // apart titles, section headings, and sub-headings.
  (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).forEach((tag, i) => {
    const marker = '#'.repeat(i + 1) + ' ';
    $(tag).each((_, el) => {
      $(el).prepend(marker);
    });
  });

  // Blockquotes: prefix content so quoted passages are clearly delimited.
  $('blockquote').each((_, el) => {
    $(el).prepend('> ');
  });

  // Inline emphasis: bold/strong text (prices, names, key dates) is wrapped
  // in ** and italic/em in _ so the AI can recognise highlighted content.
  $('strong, b').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`**${text}**`);
  });
  $('em, i').each((_, el) => {
    const text = $(el).text().trim();
    if (text) $(el).replaceWith(`_${text}_`);
  });

  $('li').each((_, element) => {
    const prefix = $(element).parents('ol').length > 0 ? '1. ' : '- ';
    $(element).prepend(prefix);
  });

  // Tables: process from innermost to outermost so nested tables are resolved
  // before their parent examines cell content.
  //
  // Data tables — those that directly own <th> or <thead> elements (not
  // inherited from inner nested tables) and are not marked as presentational —
  // are rendered as Markdown pipe-table rows so structured data like pricing,
  // schedules, order summaries, and event details is legible to the AI.
  //
  // Layout/presentation tables (role="presentation"|"none", or no header
  // elements) are left in the DOM so their cells receive paragraph breaks via
  // the block-elements loop below, keeping sectioned content readable without
  // emitting spurious `| | |` rows.
  $('table')
    .toArray()
    .reverse()
    .forEach((table) => {
      const $table = $(table);
      const role = $table.attr('role')?.toLowerCase();
      const isPresentation = role === 'presentation' || role === 'none';

      // Only count <th>/<thead> that belong directly to this table, not to an
      // already-replaced inner table.
      const hasOwnHeaders =
        $table.find('th, thead').filter((_, el) => $(el).closest('table').is(table)).length > 0;

      if (!isPresentation && hasOwnHeaders) {
        const lines: string[] = [];
        let separatorDone = false;

        $table
          .find('tr')
          .filter((_, row) => $(row).closest('table').is(table))
          .each((_, row) => {
            const $row = $(row);
            const isHeaderRow =
              $row.closest('thead').length > 0 ||
              $row.find('th').filter((_, el) => $(el).closest('tr').is(row)).length > 0;

            const cells: string[] = [];
            $row
              .find('th, td')
              .filter((_, el) => $(el).closest('tr').is(row))
              .each((_, cell) => {
                cells.push($(cell).text().replace(/\s+/g, ' ').trim());
              });

            if (!cells.length) return;
            lines.push('| ' + cells.join(' | ') + ' |');
            if (isHeaderRow && !separatorDone) {
              lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
              separatorDone = true;
            }
          });

        $table.replaceWith(lines.length ? '\n\n' + lines.join('\n') + '\n\n' : '\n\n');
      }
      // Presentation/layout tables fall through to the block-elements loop.
    });

  // Append double newlines after all block-level elements so their text is
  // separated from surrounding content.  `td`, `th`, `tr`, `thead`, `tbody`,
  // and `tfoot` are included here so that cells from layout/presentation tables
  // (not converted to Markdown rows above) are rendered as individual
  // paragraphs rather than run together.
  $(
    'address, article, blockquote, button, caption, dd, details, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, li, main, nav, ol, p, pre, section, summary, table, tbody, td, tfoot, th, thead, tr, ul',
  ).each((_, element) => {
    $(element).append('\n\n');
  });

  return $.root()
    .text()
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converts an HTML email body into compact Markdown-like text using Cheerio.
 * This keeps visible email details from table-based templates that article
 * extractors often discard, such as dates, venues, and street addresses.
 */
async function htmlToMarkdown(html: string): Promise<string> {
  try {
    const normalized = htmlFragmentToMarkdownish(html);
    if (normalized) return normalized;

    return stripHtmlForExtraction(html);
  } catch (err) {
    console.warn('[email-agent] cheerio extraction failed, using fallback:', err);
    return stripHtmlForExtraction(html);
  }
}

async function preAnalyzeEmail(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  isHtml: boolean,
  openrouterProvider: ReturnType<typeof createOpenAI>,
  model: string,
  agentRuntimeSettings: AgentRuntimeSettings,
  outputLanguage?: string,
  openRouterTracking?: OpenRouterTrackingContext,
): Promise<PreAnalysisResult> {
  // Convert HTML to reader-focused structured text so the AI receives cleaner
  // content than raw HTML. Plain-text emails are used as-is.
  const bodyExcerpt = isHtml
    ? (await htmlToMarkdown(emailBody)).slice(0, agentRuntimeSettings.bodyAnalysisMaxChars)
    : emailBody.slice(0, agentRuntimeSettings.bodyAnalysisMaxChars);

  try {
    const { object, usage } = await generateObject({
      model: openrouterProvider(model),
      schema: emailAnalysisSchema,
      maxRetries: 3,
      system: buildEmailAgentAnalysisSystemPrompt(outputLanguage),
      prompt: buildEmailAgentAnalysisPrompt(
        sanitizeEmailField(emailFrom),
        sanitizeEmailField(emailSubject),
        isHtml,
        bodyExcerpt,
      ),
      maxOutputTokens: agentRuntimeSettings.analysisMaxTokens,
      ...(buildOpenRouterProviderOptions(openRouterTracking)
        ? { providerOptions: buildOpenRouterProviderOptions(openRouterTracking) }
        : {}),
    });
    const normalizedUsage = normalizeUsageTotals(usage);

    return {
      analysis: object as RawEmailAnalysis,
      extractedBody: bodyExcerpt,
      tokensUsed: normalizedUsage.totalTokens,
      promptTokens: normalizedUsage.promptTokens,
      completionTokens: normalizedUsage.completionTokens,
    };
  } catch (err) {
    console.warn('Email pre-analysis failed, continuing without analysis context:', err);
    return {
      analysis: null,
      extractedBody: bodyExcerpt,
      tokensUsed: 0,
      promptTokens: 0,
      completionTokens: 0,
    };
  }
}

async function hydrateEmailAnalysis(
  rawAnalysis: RawEmailAnalysis | null,
  googleMapsApiKey?: string,
): Promise<EmailAnalysis | null> {
  if (!rawAnalysis) return null;

  const geocodedPlaces = await geocodePlaceNames(
    normalizeUniqueStrings(rawAnalysis.entities.places),
    googleMapsApiKey,
  );
  const placeNames = extractStoredPlaceNames(geocodedPlaces);

  return {
    ...rawAnalysis,
    summary: rawAnalysis.summary.trim(),
    topics: normalizeUniqueStrings(rawAnalysis.topics),
    intent: rawAnalysis.intent.trim(),
    language: rawAnalysis.language.trim().toLowerCase(),
    entities: {
      places: geocodedPlaces,
      placeNames,
      events: normalizeUniqueStrings(rawAnalysis.entities.events),
      dates: normalizeUniqueStrings(rawAnalysis.entities.dates),
      people: normalizeUniqueStrings(rawAnalysis.entities.people),
      organizations: normalizeUniqueStrings(rawAnalysis.entities.organizations),
      numbers: normalizeUniqueNumberStrings(rawAnalysis.entities.numbers),
    },
    ...(rawAnalysis.prices ? { prices: normalizeUniqueStrings(rawAnalysis.prices) } : {}),
  };
}

export async function analyzeEmailContent(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  isHtml = false,
  modelOverride?: string,
  analysisOutputLanguage?: string,
  openRouterTracking?: OpenRouterTrackingContext,
): Promise<AnalyzeEmailContentResult> {
  const { apiKey, model: settingsModel } = await getOpenRouterClient(openRouterTracking);
  const model = modelOverride || settingsModel;

  if (!apiKey) {
    throw new Error('Missing OpenRouter API key');
  }

  const settings = await getGlobalSettings();
  const agentRuntimeSettings = resolveAgentRuntimeSettings(settings);
  const googleMapsApiKey =
    (typeof settings?.googleMapsApiKey === 'string' ? settings.googleMapsApiKey.trim() : '') ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: buildOpenRouterHeaders(openRouterTracking),
  });

  const result = await preAnalyzeEmail(
    emailFrom,
    emailSubject,
    emailBody,
    isHtml,
    openrouter,
    model,
    agentRuntimeSettings,
    analysisOutputLanguage,
    openRouterTracking,
  );

  const analysis = await hydrateEmailAnalysis(result.analysis, googleMapsApiKey);

  const pricing = await getModelPricing(model, apiKey);
  const estimatedCost = calculateCost(result.promptTokens, result.completionTokens, pricing);

  return {
    analysis,
    extractedBody: result.extractedBody,
    tokensUsed: result.tokensUsed,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    estimatedCost,
    model,
  };
}
