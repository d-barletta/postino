import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMailgunSignature, isMailgunTimestampFresh, type EmailAttachment } from '@/lib/email';
import { enqueueEmailJob } from '@/lib/email-jobs';
import {
  deleteAttachmentFromStorage,
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  uploadAttachmentToStorage,
  type QueuedInboundPayload,
  type SerializedAttachment,
} from '@/lib/inbound-processing';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
const LOOP_MARKER_HEADER = 'x-postino-processed';
const ASYNC_TRIGGER_BATCH_SIZE = 1;
const WEBHOOK_LOG_FIELD_MAX_CHARS = 20_000;
const WEBHOOK_LOG_FIELDS_TOTAL_MAX_CHARS = 300_000;

type WebhookLogFieldValue = string | string[];

interface WebhookFormSnapshot {
  previewFields: Record<string, WebhookLogFieldValue>;
  rawFields: Record<string, WebhookLogFieldValue>;
  files: Array<{ field: string; name: string; type: string; size: number }>;
  totalChars: number;
  truncatedFields: string[];
}

interface StoreAttachmentRef {
  url: string;
  name?: string;
  contentType?: string;
  size?: number;
  /** Stripped Content-ID for inline attachments (angle brackets removed). */
  contentId?: string;
}

/** Extract a bare email address from `Name <email@example.com>` style headers. */
function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function getInboundHeaderMap(formData: FormData): Map<string, string> {
  const headerMap = new Map<string, string>();

  const keys = ['message-headers', 'Message-Headers', 'Message-headers'];
  for (const key of keys) {
    const raw = formData.get(key);
    if (typeof raw !== 'string' || !raw.trim()) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;

      parsed.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return;
        const headerName = typeof entry[0] === 'string' ? entry[0].trim().toLowerCase() : '';
        const headerValue = typeof entry[1] === 'string' ? entry[1] : '';
        if (headerName && !headerMap.has(headerName)) {
          headerMap.set(headerName, headerValue);
        }
      });
    } catch {
      // Ignore malformed `message-headers`; loop detection falls back to explicit fields.
    }
  }

  const explicitHeaders = [
    LOOP_MARKER_HEADER,
    'auto-submitted',
    'precedence',
    'x-auto-response-suppress',
  ];
  explicitHeaders.forEach((header) => {
    if (headerMap.has(header)) return;
    const value = formData.get(header) ?? formData.get(header.toUpperCase());
    if (typeof value === 'string' && value.trim()) {
      headerMap.set(header, value);
    }
  });

  return headerMap;
}

function isLikelyMailLoop(formData: FormData, sender: string, recipientUserEmail: string): boolean {
  const headers = getInboundHeaderMap(formData);

  const loopMarker = (headers.get(LOOP_MARKER_HEADER) || '').trim().toLowerCase();
  if (loopMarker === 'true' || loopMarker === '1' || loopMarker === 'yes') {
    return true;
  }

  const autoSubmitted = (headers.get('auto-submitted') || '').trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') {
    return true;
  }

  const senderEmail = extractEmailAddress(sender);
  const recipientEmail = extractEmailAddress(recipientUserEmail);
  return Boolean(senderEmail && recipientEmail && senderEmail === recipientEmail);
}

/** Strip CR and LF characters to prevent email header (CRLF) injection. */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

function normalizeIpAddress(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for') || '';
  if (xff.trim()) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip') || '';
  return xri.trim();
}

function serializeRequestHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function appendField(
  target: Record<string, WebhookLogFieldValue>,
  key: string,
  value: string,
): void {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  target[key] = [existing, value];
}

function toPreviewValue(
  value: string,
  budget: { used: number },
  truncatedFields: string[],
  fieldName: string,
): string {
  const remaining = Math.max(0, WEBHOOK_LOG_FIELDS_TOTAL_MAX_CHARS - budget.used);
  if (remaining === 0) {
    truncatedFields.push(fieldName);
    return '[TRUNCATED: field omitted because total payload preview budget is exhausted]';
  }

  const cap = Math.min(WEBHOOK_LOG_FIELD_MAX_CHARS, remaining);
  if (value.length <= cap) {
    budget.used += value.length;
    return value;
  }

  truncatedFields.push(fieldName);
  budget.used += cap;
  return `${value.slice(0, cap)}\n[TRUNCATED: original length ${value.length} chars]`;
}

function snapshotWebhookFormData(formData: FormData): WebhookFormSnapshot {
  const previewFields: Record<string, WebhookLogFieldValue> = {};
  const rawFields: Record<string, WebhookLogFieldValue> = {};
  const files: Array<{ field: string; name: string; type: string; size: number }> = [];
  let totalChars = 0;
  const truncatedFields: string[] = [];
  const budget = { used: 0 };

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      totalChars += value.length;
      appendField(rawFields, key, value);
      appendField(previewFields, key, toPreviewValue(value, budget, truncatedFields, key));
      continue;
    }

    files.push({
      field: key,
      name: value.name,
      type: value.type || 'application/octet-stream',
      size: value.size,
    });
  }

  return {
    previewFields,
    rawFields,
    files,
    totalChars,
    truncatedFields,
  };
}

/** Strip enclosing angle brackets from a Content-ID value (e.g. `<abc@def>` → `abc@def`). */
function stripContentId(raw: string): string {
  return raw.replace(/^</, '').replace(/>$/, '');
}

function parseStoreAttachments(formData: FormData): StoreAttachmentRef[] {
  const raw = formData.get('attachments');
  if (typeof raw !== 'string' || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry): StoreAttachmentRef | null => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const rawUrl = typeof record.url === 'string' ? record.url.trim() : '';
        if (!rawUrl) return null;
        const rawName = typeof record.name === 'string' ? record.name.trim() : '';
        const rawType =
          typeof record['content-type'] === 'string' ? record['content-type'].trim() : '';
        const rawSize =
          typeof record.size === 'number' && Number.isFinite(record.size)
            ? Math.max(0, Math.floor(record.size))
            : undefined;

        const strippedContentId =
          typeof record['content-id'] === 'string'
            ? stripContentId(record['content-id'].trim())
            : '';

        return {
          url: rawUrl,
          ...(rawName ? { name: rawName } : {}),
          ...(rawType ? { contentType: rawType } : {}),
          ...(typeof rawSize === 'number' ? { size: rawSize } : {}),
          ...(strippedContentId ? { contentId: strippedContentId } : {}),
        };
      })
      .filter((entry): entry is StoreAttachmentRef => entry !== null);
  } catch {
    return [];
  }
}

/**
 * Parse the `attachments` array from a Mailgun stored-message API response.
 * The stored message endpoint (GET /v3/domains/{domain}/messages/{key}) returns
 * attachment metadata including the authoritative download URLs.
 */
function parseAttachmentsFromStoredMessage(data: unknown): StoreAttachmentRef[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.attachments)) return [];

  return obj.attachments
    .map((entry): StoreAttachmentRef | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const rawUrl = typeof record.url === 'string' ? record.url.trim() : '';
      if (!rawUrl) return null;
      const rawName = typeof record.name === 'string' ? record.name.trim() : '';
      const rawType =
        typeof record['content-type'] === 'string' ? record['content-type'].trim() : '';
      const rawSize =
        typeof record.size === 'number' && Number.isFinite(record.size)
          ? Math.max(0, Math.floor(record.size))
          : undefined;

      const strippedContentId =
        typeof record['content-id'] === 'string' ? stripContentId(record['content-id'].trim()) : '';

      return {
        url: rawUrl,
        ...(rawName ? { name: rawName } : {}),
        ...(rawType ? { contentType: rawType } : {}),
        ...(typeof rawSize === 'number' ? { size: rawSize } : {}),
        ...(strippedContentId ? { contentId: strippedContentId } : {}),
      };
    })
    .filter((entry): entry is StoreAttachmentRef => entry !== null);
}

function resolveStoreAttachmentUrl(
  rawUrl: string,
  mailgunBaseUrl: string,
  envMailgunBaseUrl?: string,
): string | null {
  try {
    const base = new URL(mailgunBaseUrl);
    const resolved = new URL(rawUrl, mailgunBaseUrl);
    if (resolved.protocol !== 'https:') return null;

    const envBaseHost = (() => {
      if (!envMailgunBaseUrl || !envMailgunBaseUrl.trim()) return '';
      try {
        return new URL(envMailgunBaseUrl).host;
      } catch {
        return '';
      }
    })();

    const trustedHosts = new Set([
      base.host,
      ...(envBaseHost ? [envBaseHost] : []),
      'api.mailgun.net',
      'api.eu.mailgun.net',
    ]);
    // Mailgun regional storage hosts follow the pattern storage-<region>.api[.eu].mailgun.net.
    // Using an anchored regex prevents overly broad suffix matching that could admit
    // attacker-controlled subdomains (e.g. evil.api.mailgun.net).
    const isTrustedStorageHost =
      /^storage-[a-z0-9]+(?:-[a-z0-9]+)*\.api(?:\.eu)?\.mailgun\.net$/.test(resolved.host);

    if (!trustedHosts.has(resolved.host) && !isTrustedStorageHost) return null;

    // Restrict to expected API routes to reduce risk of arbitrary fetches.
    if (!resolved.pathname.startsWith('/v3/')) return null;

    // Return the resolved URL directly. Mailgun's regional storage servers
    // (e.g. storage-europe-west1.api.mailgun.net) accept HTTP Basic auth with
    // the API key and serve attachment sub-paths (/attachments/{index}).
    // Rewriting to the main API base URL (api.eu.mailgun.net) causes 404 errors
    // because those sub-paths are only available on the storage hosts.
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Parse the filename from an HTTP `Content-Disposition` header value.
 * Handles the RFC 5987 `filename*=` form (percent-encoded, charset-prefixed) and
 * the basic `filename=` form (optionally quoted).
 * Returns null when no usable filename can be extracted.
 */
function parseFilenameFromContentDisposition(header: string): string | null {
  if (!header) return null;

  // RFC 5987: filename*=charset'language'encoded%20name.pdf
  // charset is required; language tag is optional (may be empty).
  const rfc5987 = header.match(/filename\*\s*=\s*(?:[A-Za-z0-9\-]+'[A-Za-z0-9\-]*')?([^\s;]+)/i);
  if (rfc5987 && rfc5987[1]) {
    try {
      const decoded = decodeURIComponent(rfc5987[1]).trim();
      if (decoded) return decoded;
    } catch {
      const raw = rfc5987[1].trim();
      if (raw) return raw;
    }
  }

  // Basic: filename="quoted name.pdf" or filename=unquoted.pdf
  const basic = header.match(/filename\s*=\s*"((?:[^"\\]|\\.)*)"|filename\s*=\s*([^\s;]+)/i);
  if (basic) {
    const name = (
      basic[1] !== undefined
        ? basic[1].replace(/\\(.)/g, '$1') // unescape backslash sequences
        : (basic[2] ?? '')
    ).trim();
    if (name) return name;
  }

  return null;
}

/**
 * Return a file extension (including the leading dot) that corresponds to the
 * given MIME type, or an empty string when no mapping is known.
 * Used as a last-resort fallback so forwarded attachments always carry an
 * extension even when neither the Mailgun metadata nor the Content-Disposition
 * response header contains the original filename.
 */
function extensionFromMimeType(mimeType: string): string {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/gzip': '.gz',
    'application/x-tar': '.tar',
    'application/x-rar-compressed': '.rar',
    'application/vnd.rar': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.oasis.opendocument.text': '.odt',
    'application/vnd.oasis.opendocument.spreadsheet': '.ods',
    'application/vnd.oasis.opendocument.presentation': '.odp',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/csv': '.csv',
    'text/calendar': '.ics',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff',
    'image/bmp': '.bmp',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/mpeg': '.mpeg',
    'video/ogg': '.ogv',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'application/json': '.json',
    'application/xml': '.xml',
    'text/xml': '.xml',
  };
  return map[type] ?? '';
}

/**
 * Ensure that `filename` carries a file-extension by appending one derived
 * from `mimeType` when the basename has no extension.
 */
function ensureFilenameExtension(filename: string, mimeType: string): string {
  if (!filename) return filename;
  const lastSep = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  const dot = filename.lastIndexOf('.');
  // A dot that appears after the last path separator (and not at position 0
  // of the basename, i.e. hidden-file convention) counts as an extension.
  const hasExtension = dot > 0 && dot > lastSep;
  if (hasExtension) return filename;
  const ext = extensionFromMimeType(mimeType);
  return ext ? `${filename}${ext}` : filename;
}

function fingerprintSecret(secret: string): string {
  if (!secret) return '';
  return crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

function getMailgunBaseHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return '';
  }
}

function buildCanonicalStoredMessageUrl(
  rawStoredMessageUrl: string,
  mailgunBaseUrl: string,
): string | null {
  try {
    const parsed = new URL(rawStoredMessageUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 5) return null;
    if (segments[0] !== 'v3' || segments[1] !== 'domains' || segments[3] !== 'messages')
      return null;

    const domain = segments[2]?.trim();
    const storageKey = segments[4]?.trim();
    if (!domain || !storageKey) return null;

    const base = new URL(mailgunBaseUrl);
    const canonicalPath = `/v3/domains/${encodeURIComponent(domain)}/messages/${encodeURIComponent(storageKey)}`;
    return new URL(canonicalPath, base).toString();
  } catch {
    return null;
  }
}

async function readResponseSnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.slice(0, 280);
  } catch {
    return '';
  }
}

function classifyStoredMessageFetchFailure(statusCode: number): {
  classCode: 'auth-config' | 'missing-or-expired' | 'rate-limited' | 'upstream-error';
  message: string;
} {
  if (statusCode === 401 || statusCode === 403) {
    return {
      classCode: 'auth-config',
      message: 'Mailgun auth/config error (check API key, domain region, and base URL)',
    };
  }
  if (statusCode === 404) {
    return {
      classCode: 'missing-or-expired',
      message: 'Stored message not found (possibly expired or unavailable in this region endpoint)',
    };
  }
  if (statusCode === 429) {
    return {
      classCode: 'rate-limited',
      message: 'Mailgun rate limit reached while fetching stored message',
    };
  }
  return {
    classCode: 'upstream-error',
    message: 'Mailgun upstream error while fetching stored message',
  };
}

function isMessageRetrievalDisabledResponseSnippet(snippet: string): boolean {
  if (!snippet) return false;
  return snippet.toLowerCase().includes('message retrieval disabled');
}

async function uploadWebhookPayloadSnapshot(
  logId: string,
  payload: unknown,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const storagePath = `mailgun-webhook-logs/${logId}/payload.json`;
    const content = Buffer.from(JSON.stringify(payload, null, 2));
    const { error } = await supabase.storage
      .from('email-attachments')
      .upload(storagePath, content, { contentType: 'application/json', upsert: true });
    if (error) throw error;
    return storagePath;
  } catch (err) {
    console.error('Failed to upload webhook payload snapshot to Supabase Storage:', err);
    return null;
  }
}

/**
 * Schedule a non-blocking call to the email-jobs process endpoint after a short delay.
 * Uses `after()` so the response is returned immediately; the fetch runs after the
 * request is complete, with a 10-second delay to give the DB time to persist the job.
 */
function scheduleProcessingTrigger(request: NextRequest): void {
  const workerSecret = process.env.EMAIL_JOBS_WORKER_SECRET || '';
  const cronSecret = process.env.CRON_SECRET || '';

  if (!workerSecret && !cronSecret) {
    // Cannot authorise the internal call — skip silently.
    // Processing will still occur via the scheduled cron job.
    return;
  }

  after(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20_000));

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const host = request.headers.get('host') || 'localhost:3000';
    const proto =
      request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const baseUrl = appUrl || `${proto}://${host}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workerSecret) {
      headers['x-worker-secret'] = workerSecret;
    } else {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    try {
      await fetch(`${baseUrl}/api/internal/email-jobs/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchSize: ASYNC_TRIGGER_BATCH_SIZE }),
      });
    } catch (err) {
      console.error('Async process trigger failed:', err);
    }
  });
}

async function cleanupUploadedAttachments(attachments: SerializedAttachment[]): Promise<void> {
  if (attachments.length === 0) return;

  await Promise.all(
    attachments
      .filter((attachment) => attachment.storagePath)
      .map((attachment) => deleteAttachmentFromStorage(attachment.storagePath!)),
  );
}

export async function POST(request: NextRequest) {
  let logId: string | null = null;
  let finalUserId: string | null = null;
  let finalSender = '';
  let finalSubject = '';
  let uploadedSerializedAttachments: SerializedAttachment[] = [];
  let webhookLogId: string | null = null;
  // Track accumulated preview/raw/linked state for incremental webhook log updates
  const webhookPreviewFields: Record<string, unknown> = {};
  const webhookRawFields: Record<string, unknown> = {};
  const webhookLinked: Record<string, unknown> = {};

  async function updateWebhookLog(update: Record<string, unknown>): Promise<void> {
    if (!webhookLogId) return;
    try {
      const supabase = createAdminClient();
      const now = new Date().toISOString();
      const flat: Record<string, unknown> = { updated_at: now };
      let previewChanged = false;
      let rawChanged = false;
      let linkedChanged = false;

      for (const [key, value] of Object.entries(update)) {
        if (key === 'status') flat.status = value;
        else if (key === 'result') flat.result = value;
        else if (key === 'reason') flat.reason = value;
        else if (key === 'linked') {
          Object.assign(webhookLinked, value as Record<string, unknown>);
          linkedChanged = true;
        } else if (key.startsWith('linked.')) {
          webhookLinked[key.slice('linked.'.length)] = value;
          linkedChanged = true;
        } else if (key.startsWith('parsed.')) {
          webhookPreviewFields[key.slice('parsed.'.length)] = value;
          previewChanged = true;
        } else if (key.startsWith('request.')) {
          webhookRawFields[key.slice('request.'.length)] = value;
          rawChanged = true;
        }
        // skip details.* and other unmapped fields
      }

      if (previewChanged) flat.preview_fields = { ...webhookPreviewFields };
      if (rawChanged) flat.raw_fields = { ...webhookRawFields };
      if (linkedChanged) flat.linked = { ...webhookLinked };

      await supabase
        .from('mailgun_webhook_logs')
        .update(
          flat as import('@/types/supabase').Database['public']['Tables']['mailgun_webhook_logs']['Update'],
        )
        .eq('id', webhookLogId);
    } catch (err) {
      console.error('Failed to update mailgunWebhookLogs entry:', err);
    }
  }

  try {
    const formData = await request.formData();

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settings = settingsRow?.data as Record<string, unknown> | null;

    const webhookLoggingEnabled = settings?.mailgunWebhookLoggingEnabled === true;
    const formSnapshot = snapshotWebhookFormData(formData);
    const senderForLog = stripCrlf((formData.get('sender') as string) || '');
    const recipientForLog = stripCrlf((formData.get('recipient') as string) || '');
    const subjectForLog = stripCrlf((formData.get('subject') as string) || '');
    const messageIdForLog = stripCrlf((formData.get('Message-Id') as string) || '');
    const storeAttachmentsForLog = parseStoreAttachments(formData);
    const rawAttachmentCountForLog = parseInt(
      (formData.get('attachment-count') as string) || '0',
      10,
    );
    const attachmentCountForLog =
      storeAttachmentsForLog.length > 0
        ? storeAttachmentsForLog.length
        : Number.isFinite(rawAttachmentCountForLog)
          ? Math.max(0, rawAttachmentCountForLog)
          : 0;

    if (webhookLoggingEnabled) {
      const now = new Date().toISOString();
      // Initialize local tracking state — only metadata goes in DB; full payload is in storage.
      Object.assign(webhookPreviewFields, {
        sender: senderForLog,
        recipient: recipientForLog,
        subject: subjectForLog,
        messageId: messageIdForLog,
        attachmentCount: attachmentCountForLog,
      });
      Object.assign(webhookRawFields, {
        method: request.method,
        url: request.url,
        ip: normalizeIpAddress(request),
        userAgent: request.headers.get('user-agent') || '',
        host: request.headers.get('host') || '',
        contentType: request.headers.get('content-type') || '',
        payloadStoragePath: null,
      });

      const { data: newLog } = await supabase
        .from('mailgun_webhook_logs')
        .insert({
          status: 'received',
          result: 'pending',
          reason: null,
          received_at: now,
          updated_at: now,
          preview_fields: { ...webhookPreviewFields } as import('@/types/supabase').Json,
          raw_fields: { ...webhookRawFields } as import('@/types/supabase').Json,
          files: formSnapshot.files as unknown as import('@/types/supabase').Json,
          linked: {} as import('@/types/supabase').Json,
        })
        .select('id')
        .single();
      webhookLogId = newLog?.id ?? null;

      const payloadStoragePath = webhookLogId
        ? await uploadWebhookPayloadSnapshot(webhookLogId, {
            request: {
              method: request.method,
              url: request.url,
              ip: normalizeIpAddress(request),
              headers: serializeRequestHeaders(request.headers),
            },
            formData: {
              fields: formSnapshot.rawFields,
              files: formSnapshot.files,
            },
          })
        : null;

      if (payloadStoragePath) {
        await updateWebhookLog({ 'request.payloadStoragePath': payloadStoragePath });
      }
    }

    if (settings?.maintenanceMode === true) {
      console.log('Maintenance mode is active, email not forwarded');
      await updateWebhookLog({
        status: 'skipped',
        result: 'maintenance-mode',
        reason: 'Maintenance mode is active',
      });
      return NextResponse.json({ message: 'Service is under maintenance. Email not forwarded.' });
    }

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    if (!timestamp || !token || !signature) {
      await updateWebhookLog({
        status: 'rejected',
        result: 'missing-signature-fields',
        reason: 'Missing webhook signature fields',
      });
      return NextResponse.json({ error: 'Missing webhook signature fields' }, { status: 400 });
    }

    const mailgunWebhookSigningKey =
      (typeof settings?.mailgunWebhookSigningKey === 'string'
        ? settings.mailgunWebhookSigningKey
        : '') ||
      process.env.MAILGUN_WEBHOOK_SIGNING_KEY ||
      '';
    const mailgunDomain =
      (typeof settings?.mailgunSandboxEmail === 'string' ? settings.mailgunSandboxEmail : '') ||
      (typeof settings?.mailgunDomain === 'string' ? settings.mailgunDomain : '') ||
      process.env.MAILGUN_SANDBOX_EMAIL ||
      '';
    const mailgunApiKey =
      (typeof settings?.mailgunApiKey === 'string' ? settings.mailgunApiKey : '') ||
      process.env.MAILGUN_API_KEY ||
      '';
    const mailgunBaseUrl =
      (typeof settings?.mailgunBaseUrl === 'string' ? settings.mailgunBaseUrl : '') ||
      process.env.MAILGUN_BASE_URL ||
      'https://api.mailgun.net';

    if (!mailgunWebhookSigningKey) {
      console.error('Mailgun webhook signing key is missing; refusing inbound webhook');
      await updateWebhookLog({
        status: 'rejected',
        result: 'missing-signing-key',
        reason: 'MAILGUN_WEBHOOK_SIGNING_KEY is not configured',
      });
      return NextResponse.json(
        { error: 'Webhook signature key is not configured' },
        { status: 503 },
      );
    }

    if (!isMailgunTimestampFresh(timestamp)) {
      await updateWebhookLog({
        status: 'rejected',
        result: 'stale-timestamp',
        reason: 'Stale webhook timestamp',
      });
      return NextResponse.json({ error: 'Stale webhook timestamp' }, { status: 403 });
    }

    if (!verifyMailgunSignature(timestamp, token, signature, mailgunWebhookSigningKey)) {
      await updateWebhookLog({
        status: 'rejected',
        result: 'invalid-signature',
        reason: 'Invalid webhook signature',
      });
      return NextResponse.json(
        {
          error: 'Invalid signature',
          hint: `Check Mailgun webhook signing key and endpoint (${mailgunBaseUrl})`,
        },
        { status: 403 },
      );
    }

    const nonceId = crypto.createHash('sha256').update(`${timestamp}:${token}`).digest('hex');

    try {
      const { error: nonceError } = await supabase
        .from('mailgun_webhook_nonces')
        .insert({ id: nonceId, created_at: new Date().toISOString() });
      if (nonceError) {
        // code 23505 = unique_violation (replay detected)
        throw nonceError;
      }
    } catch {
      await updateWebhookLog({
        status: 'rejected',
        result: 'replay-detected',
        reason: 'Webhook replay detected',
      });
      return NextResponse.json({ error: 'Webhook replay detected' }, { status: 409 });
    }

    const recipientRaw = (formData.get('recipient') as string) || '';
    const recipients = recipientRaw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const normalizedRecipients = recipients.map((recipient) =>
      recipient.includes('@') || !mailgunDomain
        ? recipient
        : `${recipient}@${mailgunDomain}`.toLowerCase(),
    );

    const sender = stripCrlf((formData.get('sender') as string) || '');
    const fromHeader = stripCrlf(
      (formData.get('From') as string) || (formData.get('from') as string) || '',
    );
    const replyToHeader = stripCrlf((formData.get('Reply-To') as string) || '');
    const ccHeader = stripCrlf(
      (formData.get('Cc') as string) || (formData.get('cc') as string) || '',
    );
    const bccHeader = stripCrlf(
      (formData.get('Bcc') as string) || (formData.get('bcc') as string) || '',
    );
    const subject = stripCrlf((formData.get('subject') as string) || '');
    finalSender = sender;
    finalSubject = subject;
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;
    const messageId = stripCrlf((formData.get('Message-Id') as string) || '');

    const rawAttachmentCount = parseInt((formData.get('attachment-count') as string) || '0', 10);
    // `message-url` is provided by Mailgun's store() route action and points to the stored message.
    // It is the canonical source for fetching the full message and its attachment download URLs.
    const rawMessageUrl = ((formData.get('message-url') as string) || '').trim();
    const storeAttachments = parseStoreAttachments(formData);
    // Treat as store-mode when message-url is present (even if the webhook attachments JSON is absent).
    const hasStoreAttachments = storeAttachments.length > 0 || rawMessageUrl.length > 0;
    const attachmentCount =
      storeAttachments.length > 0
        ? storeAttachments.length
        : Number.isFinite(rawAttachmentCount)
          ? Math.max(0, rawAttachmentCount)
          : 0;

    await updateWebhookLog({
      'parsed.attachmentCount': attachmentCount,
      'parsed.attachmentSource': rawMessageUrl
        ? 'store-message-url'
        : hasStoreAttachments
          ? 'store'
          : 'multipart',
    });

    if (attachmentCount > MAX_ATTACHMENTS) {
      await updateWebhookLog({
        status: 'rejected',
        result: 'too-many-attachments',
        reason: `Too many attachments (max ${MAX_ATTACHMENTS})`,
      });
      return NextResponse.json(
        { error: `Too many attachments (max ${MAX_ATTACHMENTS})` },
        { status: 413 },
      );
    }

    // Parse content-id-map to identify inline attachments (e.g. CID-referenced images).
    // Multipart mode maps CID -> attachment-N fields, while Store mode maps CID -> attachment URLs.
    // We invert it to a map of reference key (field name or URL) -> stripped content-id.
    const contentIdFieldMap = new Map<string, string>();
    const contentIdMapRaw = formData.get('content-id-map') as string | null;
    if (contentIdMapRaw) {
      try {
        const parsed = JSON.parse(contentIdMapRaw) as Record<string, string | string[]>;
        for (const [cid, refs] of Object.entries(parsed)) {
          const strippedCid = stripContentId(cid);
          const referenceValues = Array.isArray(refs) ? refs : [refs];
          for (const refValue of referenceValues) {
            if (typeof refValue === 'string') {
              contentIdFieldMap.set(refValue, strippedCid);
            }
          }
        }
      } catch {
        // Ignore malformed content-id-map; inline images will fall back to regular attachments.
      }
    }

    const attachments: EmailAttachment[] = [];
    let totalAttachmentBytes = 0;

    console.log('[inbound] attachment routing', {
      rawAttachmentCount,
      parsedAttachmentCount: attachmentCount,
      hasStoreAttachments,
      rawMessageUrl: rawMessageUrl || null,
      storeAttachmentsCount: storeAttachments.length,
    });

    if (hasStoreAttachments) {
      if (!mailgunApiKey) {
        await updateWebhookLog({
          status: 'rejected',
          result: 'missing-mailgun-api-key',
          reason: 'MAILGUN_API_KEY is required to fetch Store attachment URLs',
        });
        return NextResponse.json(
          { error: 'Mailgun API key is required for Store attachment retrieval' },
          { status: 503 },
        );
      }

      const authHeader = `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString('base64')}`;

      // Determine the effective attachment list.
      // When Mailgun's store() action is used, the webhook provides a `message-url` pointing to
      // the stored message.  Fetching it first yields authoritative attachment metadata
      // (including the correct download URLs), which is the documented Mailgun workflow:
      //   store() → GET /v3/domains/{domain}/messages/{storage_key} → extract attachment URLs → download.
      // Fall back to the attachment URLs already present in the webhook payload when message-url
      // is not available.
      let effectiveStoreAttachments = storeAttachments;

      if (rawMessageUrl) {
        const safeMessageUrl = resolveStoreAttachmentUrl(
          rawMessageUrl,
          mailgunBaseUrl,
          process.env.MAILGUN_BASE_URL || '',
        );
        if (!safeMessageUrl) {
          await updateWebhookLog({
            status: 'rejected',
            result: 'invalid-message-url',
            reason: `Invalid or untrusted message-url: ${rawMessageUrl}`,
          });
          return NextResponse.json({ error: 'Invalid message-url' }, { status: 400 });
        }

        const safeMessageHost = (() => {
          try {
            return new URL(safeMessageUrl).host;
          } catch {
            return '';
          }
        })();
        const safeMessagePath = (() => {
          try {
            return new URL(safeMessageUrl).pathname;
          } catch {
            return '';
          }
        })();
        const storedMessageLogContext = {
          messageUrlHost: safeMessageHost,
          messageUrlPath: safeMessagePath,
          configuredBaseHost: getMailgunBaseHost(mailgunBaseUrl),
          settingsHasMailgunBaseUrl: Boolean(settings?.mailgunBaseUrl),
          apiKeyConfigured: Boolean(mailgunApiKey),
          apiKeyFingerprint: fingerprintSecret(mailgunApiKey),
        };

        let storedMessageResponse: Response;
        try {
          storedMessageResponse = await fetch(safeMessageUrl, {
            method: 'GET',
            headers: { Authorization: authHeader },
          });
        } catch (fetchErr) {
          await updateWebhookLog({
            status: 'error',
            result: 'stored-message-fetch-error',
            reason: `Failed to fetch stored message: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
            'details.storedMessageFetch': {
              ...storedMessageLogContext,
              attempt: 'primary',
            },
          });
          return NextResponse.json({ error: 'Failed to fetch stored message' }, { status: 502 });
        }

        let responseUsed = storedMessageResponse;
        let fallbackAttempted = false;
        let fallbackUrlHost = '';
        let fallbackUrlPath = '';
        let fallbackStatus = 0;
        let fallbackResponseSnippet = '';

        if (!storedMessageResponse.ok && storedMessageResponse.status === 404) {
          const canonicalMessageUrl = buildCanonicalStoredMessageUrl(
            safeMessageUrl,
            mailgunBaseUrl,
          );
          if (canonicalMessageUrl && canonicalMessageUrl !== safeMessageUrl) {
            const safeCanonicalMessageUrl = resolveStoreAttachmentUrl(
              canonicalMessageUrl,
              mailgunBaseUrl,
              process.env.MAILGUN_BASE_URL || '',
            );

            if (safeCanonicalMessageUrl) {
              fallbackAttempted = true;
              try {
                const parsedFallbackUrl = new URL(safeCanonicalMessageUrl);
                fallbackUrlHost = parsedFallbackUrl.host;
                fallbackUrlPath = parsedFallbackUrl.pathname;
              } catch {
                fallbackUrlHost = '';
                fallbackUrlPath = '';
              }

              try {
                const fallbackResponse = await fetch(safeCanonicalMessageUrl, {
                  method: 'GET',
                  headers: { Authorization: authHeader },
                });
                fallbackStatus = fallbackResponse.status;
                if (fallbackResponse.ok) {
                  responseUsed = fallbackResponse;
                } else {
                  fallbackResponseSnippet = await readResponseSnippet(fallbackResponse);
                }
              } catch (fallbackErr) {
                fallbackResponseSnippet =
                  fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
              }
            }
          }
        }

        if (responseUsed !== storedMessageResponse && responseUsed.ok) {
          await updateWebhookLog({
            'details.storedMessageFetch': {
              ...storedMessageLogContext,
              attempt: 'fallback-success',
              primaryStatus: storedMessageResponse.status,
              fallbackHost: fallbackUrlHost,
              fallbackPath: fallbackUrlPath,
              fallbackStatus,
            },
          });
        }

        if (!responseUsed.ok) {
          const primaryResponseSnippet = await readResponseSnippet(storedMessageResponse);
          const finalStatus =
            fallbackAttempted && fallbackStatus > 0 ? fallbackStatus : storedMessageResponse.status;
          const failureClass = classifyStoredMessageFetchFailure(finalStatus);
          const retrievalDisabled =
            isMessageRetrievalDisabledResponseSnippet(primaryResponseSnippet) ||
            isMessageRetrievalDisabledResponseSnippet(fallbackResponseSnippet);

          if (retrievalDisabled && effectiveStoreAttachments.length > 0) {
            await updateWebhookLog({
              result: 'stored-message-retrieval-disabled-fallback',
              reason:
                'Stored message retrieval is disabled for this Mailgun domain; using webhook-provided attachment URLs as fallback',
              'details.storedMessageFetch': {
                ...storedMessageLogContext,
                attempt: 'retrieval-disabled-fallback',
                failureClass: 'retrieval-disabled',
                primaryStatus: storedMessageResponse.status,
                primaryResponseSnippet,
                fallbackAttempted,
                fallbackHost: fallbackUrlHost,
                fallbackPath: fallbackUrlPath,
                fallbackStatus,
                fallbackResponseSnippet,
              },
            });
          } else {
            await updateWebhookLog({
              status: 'error',
              result: 'stored-message-fetch-failed',
              reason: `Stored message fetch failed: ${failureClass.message} (primary=${storedMessageResponse.status}${fallbackAttempted ? `, fallback=${fallbackStatus || 'none'}` : ''}) for ${safeMessageUrl}`,
              'details.storedMessageFetch': {
                ...storedMessageLogContext,
                attempt: 'failed',
                failureClass: failureClass.classCode,
                primaryStatus: storedMessageResponse.status,
                primaryResponseSnippet,
                fallbackAttempted,
                fallbackHost: fallbackUrlHost,
                fallbackPath: fallbackUrlPath,
                fallbackStatus,
                fallbackResponseSnippet,
              },
            });
            return NextResponse.json({ error: 'Failed to fetch stored message' }, { status: 502 });
          }
        }

        storedMessageResponse = responseUsed;

        try {
          const messageData = (await storedMessageResponse.json()) as unknown;
          const messageAttachments = parseAttachmentsFromStoredMessage(messageData);
          if (messageAttachments.length > 0) {
            effectiveStoreAttachments = messageAttachments;
          }
        } catch (parseErr) {
          // JSON parse error — fall back to webhook attachment list, if any.
          console.warn(
            'Failed to parse stored message JSON; falling back to webhook attachment list:',
            parseErr,
          );
        }

        // Re-validate count using the authoritative list from the stored message.
        if (effectiveStoreAttachments.length > MAX_ATTACHMENTS) {
          await updateWebhookLog({
            status: 'rejected',
            result: 'too-many-attachments',
            reason: `Too many attachments (max ${MAX_ATTACHMENTS})`,
          });
          return NextResponse.json(
            { error: `Too many attachments (max ${MAX_ATTACHMENTS})` },
            { status: 413 },
          );
        }
      }

      for (let i = 0; i < effectiveStoreAttachments.length; i++) {
        const attachmentRef = effectiveStoreAttachments[i];
        const safeUrl = resolveStoreAttachmentUrl(
          attachmentRef.url,
          mailgunBaseUrl,
          process.env.MAILGUN_BASE_URL || '',
        );
        if (!safeUrl) {
          await updateWebhookLog({
            status: 'rejected',
            result: 'invalid-store-attachment-url',
            reason: `Invalid or untrusted Store attachment URL: ${attachmentRef.url}`,
          });
          return NextResponse.json({ error: 'Invalid Store attachment URL' }, { status: 400 });
        }

        let attachmentResponse: Response;
        try {
          attachmentResponse = await fetch(safeUrl, {
            method: 'GET',
            headers: {
              Authorization: authHeader,
            },
          });
        } catch (fetchErr) {
          await updateWebhookLog({
            status: 'error',
            result: 'store-attachment-fetch-error',
            reason: `Failed to fetch Store attachment: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
          });
          return NextResponse.json({ error: 'Failed to fetch Store attachment' }, { status: 502 });
        }

        if (!attachmentResponse.ok) {
          await updateWebhookLog({
            status: 'error',
            result: 'store-attachment-fetch-failed',
            reason: `Store attachment fetch failed (${attachmentResponse.status}) for ${safeUrl}`,
          });
          return NextResponse.json({ error: 'Failed to fetch Store attachment' }, { status: 502 });
        }

        const content = await attachmentResponse.arrayBuffer();
        const attachmentSize = content.byteLength;

        if (attachmentSize > MAX_ATTACHMENT_BYTES) {
          const attachmentName = attachmentRef.name || `attachment-${i + 1}`;
          await updateWebhookLog({
            status: 'rejected',
            result: 'attachment-too-large',
            reason: `Attachment too large: ${attachmentName}`,
          });
          return NextResponse.json(
            { error: `Attachment too large: ${attachmentName}` },
            { status: 413 },
          );
        }

        totalAttachmentBytes += attachmentSize;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
          await updateWebhookLog({
            status: 'rejected',
            result: 'attachments-total-too-large',
            reason: 'Total attachment size exceeds allowed limit',
          });
          return NextResponse.json(
            { error: 'Total attachment size exceeds allowed limit' },
            { status: 413 },
          );
        }

        const resolvedContentType =
          attachmentRef.contentType ||
          attachmentResponse.headers.get('content-type') ||
          'application/octet-stream';

        // Resolve the best available filename for this attachment.
        // Priority: Mailgun metadata name → Content-Disposition response header → generic fallback.
        // Always ensure the filename carries a file extension so email clients and
        // operating systems can determine the correct application to open the file.
        const contentDispositionHeader =
          attachmentResponse.headers.get('content-disposition') || '';
        const filenameFromHeader = parseFilenameFromContentDisposition(contentDispositionHeader);
        const rawFilename = attachmentRef.name || filenameFromHeader || `attachment-${i + 1}`;
        const resolvedFilename = ensureFilenameExtension(rawFilename, resolvedContentType);

        const contentId =
          attachmentRef.contentId ||
          contentIdFieldMap.get(attachmentRef.url) ||
          contentIdFieldMap.get(safeUrl);
        attachments.push({
          filename: resolvedFilename,
          content,
          contentType: resolvedContentType,
          ...(contentId ? { contentId } : {}),
        });
      }
    } else {
      console.log('[inbound] multipart attachment mode', {
        attachmentCount,
        formDataKeys: [...new Set([...formData.keys()])],
      });
      for (let i = 1; i <= attachmentCount; i++) {
        const rawFile = formData.get(`attachment-${i}`);
        console.log(`[inbound] attachment-${i} raw`, {
          present: rawFile !== null,
          typeofValue: typeof rawFile,
          constructorName:
            rawFile != null ? ((rawFile as object).constructor?.name ?? '(no constructor)') : null,
          isFile: rawFile instanceof File,
          isBlob: rawFile instanceof Blob,
        });
        if (!rawFile) continue;
        // FormDataEntryValue is string | File. Use typeof check instead of
        // instanceof File/Blob — the File class returned by the runtime's
        // internal FormData (undici) may differ from globalThis.File, causing
        // instanceof to fail. This mirrors snapshotWebhookFormData's approach.
        if (typeof rawFile === 'string') {
          console.warn(`attachment-${i}: expected a file but received a string field; skipping`);
          continue;
        }
        const file = rawFile;
        const fileName = file.name || '';
        console.log(`[inbound] attachment-${i} accepted`, {
          fileName,
          size: file.size,
          type: file.type,
        });

        if (file.size > MAX_ATTACHMENT_BYTES) {
          const attachmentLabel = fileName || `attachment-${i}`;
          await updateWebhookLog({
            status: 'rejected',
            result: 'attachment-too-large',
            reason: `Attachment too large: ${attachmentLabel}`,
          });
          return NextResponse.json(
            { error: `Attachment too large: ${attachmentLabel}` },
            { status: 413 },
          );
        }

        totalAttachmentBytes += file.size;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
          await updateWebhookLog({
            status: 'rejected',
            result: 'attachments-total-too-large',
            reason: 'Total attachment size exceeds allowed limit',
          });
          return NextResponse.json(
            { error: 'Total attachment size exceeds allowed limit' },
            { status: 413 },
          );
        }

        const fieldName = `attachment-${i}`;
        const contentId = contentIdFieldMap.get(fieldName);
        const fileContentType = file.type || 'application/octet-stream';
        const resolvedName = ensureFilenameExtension(
          fileName || `attachment-${i}`,
          fileContentType,
        );
        // Mailgun assigns the generic name "mime-attachment.<ext>" to inline image
        // MIME parts that have no Content-ID and no filename in their headers (e.g.
        // embedded logos or buttons in forwarded emails). When no CID mapping is
        // present for such a part, treat it as inline so it is excluded from the
        // downloadable attachment list in the UI.
        const isMailgunAnonymousInline =
          !contentId &&
          /^mime-attachment\./i.test(fileName) &&
          fileContentType.startsWith('image/');
        const effectiveContentId =
          contentId || (isMailgunAnonymousInline ? `inline-${fieldName}` : undefined);
        attachments.push({
          filename: resolvedName,
          content: await file.arrayBuffer(),
          contentType: fileContentType,
          ...(effectiveContentId ? { contentId: effectiveContentId } : {}),
        });
        console.log(`[inbound] attachment-${i} pushed`, {
          resolvedName,
          fileContentType,
          contentId: effectiveContentId ?? null,
        });
      }
      console.log('[inbound] multipart attachments collected', { count: attachments.length });
    }

    if (normalizedRecipients.length === 0) {
      await updateWebhookLog({
        status: 'rejected',
        result: 'missing-recipient',
        reason: 'Missing recipient',
      });
      return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
    }

    // Supabase doesn't have a native 'in' limit; query in batches of 10 for safety
    const recipientChunks: string[][] = [];
    for (let i = 0; i < normalizedRecipients.length; i += 10) {
      recipientChunks.push(normalizedRecipients.slice(i, i + 10));
    }

    let userRow: Record<string, unknown> | null = null;
    for (const chunk of recipientChunks) {
      const { data: rows } = await supabase
        .from('users')
        .select(
          'id, assigned_email, email, is_active, is_address_enabled, is_ai_analysis_only_enabled',
        )
        .in('assigned_email', chunk)
        .eq('is_active', true)
        .limit(1);

      if (rows && rows.length > 0) {
        userRow = rows[0] as Record<string, unknown>;
        break;
      }
    }

    if (!userRow) {
      const recipientsText = normalizedRecipients.join(',');
      console.log(`No active user found for email(s): ${recipientsText}`);
      await updateWebhookLog({
        status: 'skipped',
        result: 'no-matching-user',
        reason: `No active user found for recipient(s): ${recipientsText}`,
      });
      return NextResponse.json({ message: `No active user found for email(s): ${recipientsText}` });
    }

    const userData = userRow;
    const userId = userRow.id as string;
    finalUserId = userId;
    const matchedRecipient = (userData.assigned_email as string) || normalizedRecipients[0];

    if (isLikelyMailLoop(formData, sender, (userData.email as string) || '')) {
      const skippedLogId = crypto.randomUUID();
      await supabase.from('email_logs').insert({
        id: skippedLogId,
        to_address: matchedRecipient,
        from_address: sender,
        subject,
        received_at: new Date().toISOString(),
        status: 'skipped',
        user_id: userId,
        original_body: emailBody,
        error_message: 'Possible mail loop detected; message not forwarded',
        ...(messageId ? { message_id: messageId } : {}),
      });
      await sendEmailCompletionPushNotification(userId, sender, subject, skippedLogId, 'skipped');
      await updateWebhookLog({
        status: 'skipped',
        result: 'mail-loop-detected',
        reason: 'Possible mail loop detected',
        linked: { emailLogId: skippedLogId },
      });
      return NextResponse.json({ message: 'Possible mail loop detected, email skipped' });
    }

    // Deduplicate: if a log entry already exists for this Message-Id, skip reprocessing
    if (messageId) {
      const { data: existingRows } = await supabase
        .from('email_logs')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .limit(1);
      if (existingRows && existingRows.length > 0) {
        console.log(`Duplicate email detected (Message-Id: ${messageId}), skipping`);
        await updateWebhookLog({
          status: 'skipped',
          result: 'duplicate-message-id',
          reason: `Duplicate email detected (Message-Id: ${messageId})`,
          linked: { emailLogId: existingRows[0].id as string },
        });
        return NextResponse.json({ message: 'Duplicate email, already processed' });
      }
    }

    // If the user has disabled their Postino address, register the email as skipped
    if (userData.is_address_enabled === false) {
      // If AI-analysis-only mode is enabled, queue for analysis + memory but skip rules/forwarding
      if (userData.is_ai_analysis_only_enabled === true) {
        const newLogId = crypto.randomUUID();
        await supabase.from('email_logs').insert({
          id: newLogId,
          to_address: matchedRecipient,
          from_address: sender,
          subject,
          received_at: new Date().toISOString(),
          status: 'received',
          user_id: userId,
          original_body: emailBody,
          ...(messageId ? { message_id: messageId } : {}),
          ...(attachments.length > 0
            ? {
                attachment_count: attachments.filter((a) => !a.contentId).length,
                attachment_names: attachments.filter((a) => !a.contentId).map((a) => a.filename),
              }
            : {}),
        });
        logId = newLogId;
        await updateWebhookLog({
          status: 'accepted',
          result: 'log-created',
          linked: { emailLogId: newLogId },
        });

        // Upload attachments to Supabase Storage so they are accessible from the dashboard.
        let aiOnlySerializedAttachments: SerializedAttachment[] | undefined;
        if (attachments.length > 0) {
          const uploaded = await Promise.all(
            attachments.map(async (att, i) => {
              const storagePath = await uploadAttachmentToStorage(att, userId, newLogId, i + 1);
              if (!storagePath) return null;
              const entry: SerializedAttachment = {
                filename: att.filename,
                contentType: att.contentType,
                storagePath,
                ...(att.contentId ? { contentId: att.contentId } : {}),
              };
              return entry;
            }),
          );
          const valid = uploaded.filter((a): a is SerializedAttachment => a !== null);
          if (valid.length > 0) {
            aiOnlySerializedAttachments = valid;
            await supabase
              .from('email_logs')
              .update({
                attachments:
                  aiOnlySerializedAttachments as unknown as import('@/types/supabase').Json,
              })
              .eq('id', newLogId);
          }
          uploadedSerializedAttachments = valid;
        }

        const aiOnlyPayload: QueuedInboundPayload = {
          logId: newLogId,
          userId,
          userEmail: (userData.email as string) || '',
          matchedRecipient,
          sender,
          fromHeader: fromHeader || undefined,
          replyToHeader,
          subject,
          emailBody,
          bodyHtml,
          bodyPlain,
          messageId,
          aiAnalysisOnly: true,
          ...(aiOnlySerializedAttachments ? { attachments: aiOnlySerializedAttachments } : {}),
        };
        const queued = await enqueueEmailJob(aiOnlyPayload, nonceId);
        if (!queued) {
          await cleanupUploadedAttachments(uploadedSerializedAttachments);
          await updateWebhookLog({
            status: 'skipped',
            result: 'duplicate-job',
            reason: 'Duplicate queue job, already queued',
            linked: { emailLogId: newLogId, jobId: nonceId },
          });
          return NextResponse.json({ message: 'Duplicate job, already queued' });
        }
        await updateWebhookLog({
          status: 'queued',
          result: 'queued',
          reason: null,
          linked: { emailLogId: newLogId, jobId: nonceId },
        });
        scheduleProcessingTrigger(request);
        console.log(
          `User ${userId} has address disabled (AI analysis only), email queued for analysis`,
        );
        return NextResponse.json({ success: true, queued: true });
      }

      const skippedLogId = crypto.randomUUID();
      await supabase.from('email_logs').insert({
        id: skippedLogId,
        to_address: matchedRecipient,
        from_address: sender,
        subject,
        received_at: new Date().toISOString(),
        status: 'skipped',
        user_id: userId,
        original_body: emailBody,
        ...(messageId ? { message_id: messageId } : {}),
      });
      await sendEmailCompletionPushNotification(userId, sender, subject, skippedLogId, 'skipped');
      console.log(`User ${userId} has address disabled, email skipped`);
      await updateWebhookLog({
        status: 'skipped',
        result: 'address-disabled',
        reason: `User ${userId} has address disabled`,
        linked: { emailLogId: skippedLogId },
      });
      return NextResponse.json({ message: 'Address disabled, email skipped' });
    }

    // Serialize attachments for queue storage.
    // All attachments, including inline CID-backed parts, are uploaded to Supabase Storage.
    let serializedAttachments: SerializedAttachment[] | undefined;

    const mainLogId = crypto.randomUUID();
    await supabase.from('email_logs').insert({
      id: mainLogId,
      to_address: matchedRecipient,
      from_address: sender,
      subject,
      received_at: new Date().toISOString(),
      status: 'received',
      user_id: userId,
      original_body: emailBody,
      ...(ccHeader ? { cc_address: ccHeader } : {}),
      ...(bccHeader ? { bcc_address: bccHeader } : {}),
      ...(messageId ? { message_id: messageId } : {}),
      ...(attachments.length > 0
        ? {
            attachment_count: attachments.filter((a) => !a.contentId).length,
            attachment_names: attachments.filter((a) => !a.contentId).map((a) => a.filename),
          }
        : {}),
    });
    logId = mainLogId;
    await updateWebhookLog({
      status: 'accepted',
      result: 'log-created',
      linked: { emailLogId: mainLogId },
    });

    // Upload all attachments to Supabase Storage now that we have the email log id for the path.
    console.log('[inbound] pre-upload attachments', {
      count: attachments.length,
      names: attachments.map((a) => a.filename),
    });
    if (attachments.length > 0) {
      const uploaded: Array<SerializedAttachment | null> = await Promise.all(
        attachments.map(async (att, i): Promise<SerializedAttachment | null> => {
          const storagePath = await uploadAttachmentToStorage(att, userId, mainLogId, i + 1);
          console.log(`[inbound] upload attachment-${i + 1}`, {
            filename: att.filename,
            contentType: att.contentType,
            byteLength: att.content.byteLength,
            storagePath: storagePath ?? null,
          });
          if (!storagePath) {
            // Storage upload failed — fall back to synchronous processing so the
            // attachment is not silently dropped.
            console.error('Attachment upload returned no storage path; falling back to sync', {
              userId,
              emailId: mainLogId,
              attachmentNumber: i + 1,
              filename: att.filename,
              contentType: att.contentType,
              byteLength: att.content.byteLength,
              isInline: Boolean(att.contentId),
            });
            return null;
          }
          return {
            filename: att.filename,
            contentType: att.contentType,
            storagePath,
            ...(att.contentId ? { contentId: att.contentId } : {}),
          };
        }),
      );

      uploadedSerializedAttachments = uploaded.filter(
        (att): att is SerializedAttachment => att !== null,
      );

      const allUploaded = uploadedSerializedAttachments.length === attachments.length;
      if (!allUploaded) {
        // One or more uploads failed — process synchronously to avoid data loss.
        const failedAttachmentNumbers = uploaded
          .map((attachment, index) => (attachment === null ? index + 1 : null))
          .filter((attachmentNumber): attachmentNumber is number => attachmentNumber !== null);

        console.error('One or more attachments failed to upload to Supabase Storage', {
          userId,
          emailId: mainLogId,
          expectedAttachments: attachments.length,
          uploadedAttachments: uploadedSerializedAttachments.length,
          failedAttachmentNumbers,
        });

        await supabase
          .from('email_logs')
          .update({ status: 'processing', processing_started_at: new Date().toISOString() })
          .eq('id', mainLogId);
        const syncPayload: QueuedInboundPayload = {
          logId: mainLogId,
          userId,
          userEmail: (userData.email as string) || '',
          matchedRecipient,
          sender,
          fromHeader: fromHeader || undefined,
          replyToHeader,
          subject,
          emailBody,
          bodyHtml,
          bodyPlain,
          messageId,
          ...(ccHeader ? { ccAddress: ccHeader } : {}),
          ...(bccHeader ? { bccAddress: bccHeader } : {}),
          ...(uploadedSerializedAttachments.length > 0
            ? { attachments: uploadedSerializedAttachments }
            : {}),
        };
        await processQueuedInboundPayload(syncPayload, attachments);
        await updateWebhookLog({
          status: 'processed',
          result: 'sync-attachments-fallback',
          reason: 'Attachment storage upload failed; processed synchronously',
          linked: { emailLogId: mainLogId },
        });
        return NextResponse.json({ success: true, mode: 'sync-attachments' });
      }

      serializedAttachments = uploadedSerializedAttachments;
    }

    const payload: QueuedInboundPayload = {
      logId: mainLogId,
      userId,
      userEmail: (userData.email as string) || '',
      matchedRecipient,
      sender,
      fromHeader: fromHeader || undefined,
      replyToHeader,
      subject,
      emailBody,
      bodyHtml,
      bodyPlain,
      messageId,
      ...(ccHeader ? { ccAddress: ccHeader } : {}),
      ...(bccHeader ? { bccAddress: bccHeader } : {}),
      ...(serializedAttachments ? { attachments: serializedAttachments } : {}),
    };

    const queued = await enqueueEmailJob(payload, nonceId);
    if (!queued) {
      // Queue insertion conflict should be rare (nonce already unique), but keep deterministic behavior.
      await cleanupUploadedAttachments(uploadedSerializedAttachments);
      await updateWebhookLog({
        status: 'skipped',
        result: 'duplicate-job',
        reason: 'Duplicate queue job, already queued',
        linked: { emailLogId: mainLogId, jobId: nonceId },
      });
      return NextResponse.json({ message: 'Duplicate job, already queued' });
    }

    if (serializedAttachments && serializedAttachments.length > 0) {
      await supabase
        .from('email_logs')
        .update({
          attachments: serializedAttachments as unknown as import('@/types/supabase').Json,
        })
        .eq('id', mainLogId);
    }

    await updateWebhookLog({
      status: 'queued',
      result: 'queued',
      reason: null,
      linked: { emailLogId: mainLogId, jobId: nonceId },
    });

    // Kick off a background processing pass after a short delay — non-blocking.
    scheduleProcessingTrigger(request);

    return NextResponse.json({ success: true, queued: true });
  } catch (error) {
    console.error('Inbound email enqueue error:', error);
    await cleanupUploadedAttachments(uploadedSerializedAttachments);
    await updateWebhookLog({
      status: 'error',
      result: 'internal-error',
      reason: error instanceof Error ? error.message : String(error),
    });
    if (logId) {
      try {
        const supabaseErr = createAdminClient();
        await supabaseErr
          .from('email_logs')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : String(error),
          })
          .eq('id', logId);
        if (finalUserId) {
          await sendEmailCompletionPushNotification(
            finalUserId,
            finalSender,
            finalSubject,
            logId,
            'error',
          );
        }
      } catch (updateError) {
        console.error('Failed to update email log with error status:', updateError);
      }
    }
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
