import { NextRequest, NextResponse, after } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { verifyMailgunSignature, isMailgunTimestampFresh, type EmailAttachment } from '@/lib/email';
import { enqueueEmailJob } from '@/lib/email-jobs';
import {
  processQueuedInboundPayload,
  sendEmailCompletionPushNotification,
  uploadAttachmentToStorage,
  type QueuedInboundPayload,
  type SerializedAttachment,
} from '@/lib/inbound-processing';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
/**
 * Maximum total base64-encoded attachment size storable in a Firestore queue job document.
 * Firestore has a 1 MB per-document limit; ~500 KB leaves room for the rest of the payload.
 */
const MAX_QUEUE_ATTACHMENT_BYTES = 500 * 1024;
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

  const explicitHeaders = [LOOP_MARKER_HEADER, 'auto-submitted', 'precedence', 'x-auto-response-suppress'];
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
  value: string
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

function toPreviewValue(value: string, budget: { used: number }, truncatedFields: string[], fieldName: string): string {
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
        const rawType = typeof record['content-type'] === 'string' ? record['content-type'].trim() : '';
        const rawSize = typeof record.size === 'number' && Number.isFinite(record.size)
          ? Math.max(0, Math.floor(record.size))
          : undefined;

        return {
          url: rawUrl,
          ...(rawName ? { name: rawName } : {}),
          ...(rawType ? { contentType: rawType } : {}),
          ...(typeof rawSize === 'number' ? { size: rawSize } : {}),
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
      const rawType = typeof record['content-type'] === 'string' ? record['content-type'].trim() : '';
      const rawSize = typeof record.size === 'number' && Number.isFinite(record.size)
        ? Math.max(0, Math.floor(record.size))
        : undefined;

      return {
        url: rawUrl,
        ...(rawName ? { name: rawName } : {}),
        ...(rawType ? { contentType: rawType } : {}),
        ...(typeof rawSize === 'number' ? { size: rawSize } : {}),
      };
    })
    .filter((entry): entry is StoreAttachmentRef => entry !== null);
}

function resolveStoreAttachmentUrl(
  rawUrl: string,
  mailgunBaseUrl: string,
  envMailgunBaseUrl?: string
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
    const isTrustedStorageHost =
      resolved.host.endsWith('.api.mailgun.net') ||
      resolved.host.endsWith('.api.eu.mailgun.net');

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
    const name = (basic[1] !== undefined
      ? basic[1].replace(/\\(.)/g, '$1')  // unescape backslash sequences
      : basic[2] ?? ''
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
  mailgunBaseUrl: string
): string | null {
  try {
    const parsed = new URL(rawStoredMessageUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 5) return null;
    if (segments[0] !== 'v3' || segments[1] !== 'domains' || segments[3] !== 'messages') return null;

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
  payload: unknown
): Promise<string | null> {
  try {
    const storage = adminStorage();
    const bucket = storage.bucket();
    const storagePath = `mailgun-webhook-logs/${logId}/payload.json`;
    const file = bucket.file(storagePath);
    await file.save(JSON.stringify(payload, null, 2), {
      contentType: 'application/json',
      metadata: { cacheControl: 'no-cache' },
    });
    return storagePath;
  } catch (err) {
    console.error('Failed to upload webhook payload snapshot to Firebase Storage:', err);
    return null;
  }
}

/**
 * Schedule a non-blocking call to the email-jobs process endpoint after a short delay.
 * Uses `after()` so the response is returned immediately; the fetch runs after the
 * request is complete, with a 10-second delay to give Firestore time to persist the job.
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
      request.headers.get('x-forwarded-proto') ||
      (host.startsWith('localhost') ? 'http' : 'https');
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

export async function POST(request: NextRequest) {
  let logId: string | null = null;
  let finalUserId: string | null = null;
  let finalSender = '';
  let finalSubject = '';
  let webhookLogRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null = null;

  async function updateWebhookLog(update: Record<string, unknown>): Promise<void> {
    if (!webhookLogRef) return;
    try {
      await webhookLogRef.update({ ...update, updatedAt: Timestamp.now() });
    } catch (err) {
      console.error('Failed to update mailgunWebhookLogs entry:', err);
    }
  }

  try {
    const formData = await request.formData();

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();

    const webhookLoggingEnabled = settings?.mailgunWebhookLoggingEnabled === true;
    const formSnapshot = snapshotWebhookFormData(formData);
    const senderForLog = stripCrlf((formData.get('sender') as string) || '');
    const recipientForLog = stripCrlf((formData.get('recipient') as string) || '');
    const subjectForLog = stripCrlf((formData.get('subject') as string) || '');
    const messageIdForLog = stripCrlf((formData.get('Message-Id') as string) || '');
    const storeAttachmentsForLog = parseStoreAttachments(formData);
    const rawAttachmentCountForLog = parseInt((formData.get('attachment-count') as string) || '0', 10);
    const attachmentCountForLog = storeAttachmentsForLog.length > 0
      ? storeAttachmentsForLog.length
      : Number.isFinite(rawAttachmentCountForLog)
      ? Math.max(0, rawAttachmentCountForLog)
      : 0;

    if (webhookLoggingEnabled) {
      webhookLogRef = await db.collection('mailgunWebhookLogs').add({
        receivedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: 'received',
        result: 'pending',
        reason: null,
        request: {
          method: request.method,
          url: request.url,
          ip: normalizeIpAddress(request),
          userAgent: request.headers.get('user-agent') || '',
          host: request.headers.get('host') || '',
          contentType: request.headers.get('content-type') || '',
          headers: serializeRequestHeaders(request.headers),
          payloadStoragePath: null,
        },
        parsed: {
          sender: senderForLog,
          recipient: recipientForLog,
          subject: subjectForLog,
          messageId: messageIdForLog,
          attachmentCount: attachmentCountForLog,
        },
        details: {
          formFields: formSnapshot.previewFields,
          files: formSnapshot.files,
          totalFieldChars: formSnapshot.totalChars,
          truncatedFields: formSnapshot.truncatedFields,
        },
        linked: {},
      });

      const payloadStoragePath = await uploadWebhookPayloadSnapshot(webhookLogRef.id, {
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
      });

      if (payloadStoragePath) {
        await updateWebhookLog({ 'request.payloadStoragePath': payloadStoragePath });
      }
    }

    if (settings?.maintenanceMode === true) {
      console.log('Maintenance mode is active, email not forwarded');
      await updateWebhookLog({ status: 'skipped', result: 'maintenance-mode', reason: 'Maintenance mode is active' });
      return NextResponse.json({ message: 'Service is under maintenance. Email not forwarded.' });
    }

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    if (!timestamp || !token || !signature) {
      await updateWebhookLog({ status: 'rejected', result: 'missing-signature-fields', reason: 'Missing webhook signature fields' });
      return NextResponse.json({ error: 'Missing webhook signature fields' }, { status: 400 });
    }

    const mailgunWebhookSigningKey =
      settings?.mailgunWebhookSigningKey ||
      process.env.MAILGUN_WEBHOOK_SIGNING_KEY ||
      '';
    const mailgunDomain =
      settings?.mailgunSandboxEmail ||
      settings?.mailgunDomain ||
      process.env.MAILGUN_SANDBOX_EMAIL ||
      '';
    const mailgunApiKey = settings?.mailgunApiKey || process.env.MAILGUN_API_KEY || '';
    const mailgunBaseUrl =
      settings?.mailgunBaseUrl || process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

    if (!mailgunWebhookSigningKey) {
      console.error('Mailgun webhook signing key is missing; refusing inbound webhook');
      await updateWebhookLog({ status: 'rejected', result: 'missing-signing-key', reason: 'MAILGUN_WEBHOOK_SIGNING_KEY is not configured' });
      return NextResponse.json({ error: 'Webhook signature key is not configured' }, { status: 503 });
    }

    if (!isMailgunTimestampFresh(timestamp)) {
      await updateWebhookLog({ status: 'rejected', result: 'stale-timestamp', reason: 'Stale webhook timestamp' });
      return NextResponse.json({ error: 'Stale webhook timestamp' }, { status: 403 });
    }

    if (!verifyMailgunSignature(timestamp, token, signature, mailgunWebhookSigningKey)) {
      await updateWebhookLog({ status: 'rejected', result: 'invalid-signature', reason: 'Invalid webhook signature' });
      return NextResponse.json(
        {
          error: 'Invalid signature',
          hint: `Check Mailgun webhook signing key and endpoint (${mailgunBaseUrl})`,
        },
        { status: 403 }
      );
    }

    const nonceId = crypto
      .createHash('sha256')
      .update(`${timestamp}:${token}`)
      .digest('hex');

    try {
      const nonceExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.collection('mailgunWebhookNonces').doc(nonceId).create({
        timestamp,
        usedAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(nonceExpiry),
      });
    } catch {
      await updateWebhookLog({ status: 'rejected', result: 'replay-detected', reason: 'Webhook replay detected' });
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
        : `${recipient}@${mailgunDomain}`.toLowerCase()
    );

    const sender = stripCrlf((formData.get('sender') as string) || '');
    const fromHeader = stripCrlf((formData.get('From') as string) || (formData.get('from') as string) || '');
    const replyToHeader = stripCrlf((formData.get('Reply-To') as string) || '');
    const ccHeader = stripCrlf((formData.get('Cc') as string) || (formData.get('cc') as string) || '');
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
    const attachmentCount = storeAttachments.length > 0
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
      await updateWebhookLog({ status: 'rejected', result: 'too-many-attachments', reason: `Too many attachments (max ${MAX_ATTACHMENTS})` });
      return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` }, { status: 413 });
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
          const strippedCid = cid.replace(/^<|>$/, '');
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
    if (hasStoreAttachments) {
      if (!mailgunApiKey) {
        await updateWebhookLog({
          status: 'rejected',
          result: 'missing-mailgun-api-key',
          reason: 'MAILGUN_API_KEY is required to fetch Store attachment URLs',
        });
        return NextResponse.json({ error: 'Mailgun API key is required for Store attachment retrieval' }, { status: 503 });
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
          process.env.MAILGUN_BASE_URL || ''
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
          const canonicalMessageUrl = buildCanonicalStoredMessageUrl(safeMessageUrl, mailgunBaseUrl);
          if (canonicalMessageUrl && canonicalMessageUrl !== safeMessageUrl) {
            const safeCanonicalMessageUrl = resolveStoreAttachmentUrl(
              canonicalMessageUrl,
              mailgunBaseUrl,
              process.env.MAILGUN_BASE_URL || ''
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
          const finalStatus = fallbackAttempted && fallbackStatus > 0 ? fallbackStatus : storedMessageResponse.status;
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
          const messageData = await storedMessageResponse.json() as unknown;
          const messageAttachments = parseAttachmentsFromStoredMessage(messageData);
          if (messageAttachments.length > 0) {
            effectiveStoreAttachments = messageAttachments;
          }
        } catch (parseErr) {
          // JSON parse error — fall back to webhook attachment list, if any.
          console.warn('Failed to parse stored message JSON; falling back to webhook attachment list:', parseErr);
        }

        // Re-validate count using the authoritative list from the stored message.
        if (effectiveStoreAttachments.length > MAX_ATTACHMENTS) {
          await updateWebhookLog({ status: 'rejected', result: 'too-many-attachments', reason: `Too many attachments (max ${MAX_ATTACHMENTS})` });
          return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` }, { status: 413 });
        }
      }

      for (let i = 0; i < effectiveStoreAttachments.length; i++) {
        const attachmentRef = effectiveStoreAttachments[i];
        const safeUrl = resolveStoreAttachmentUrl(
          attachmentRef.url,
          mailgunBaseUrl,
          process.env.MAILGUN_BASE_URL || ''
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
          await updateWebhookLog({ status: 'rejected', result: 'attachment-too-large', reason: `Attachment too large: ${attachmentName}` });
          return NextResponse.json({ error: `Attachment too large: ${attachmentName}` }, { status: 413 });
        }

        totalAttachmentBytes += attachmentSize;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
          await updateWebhookLog({ status: 'rejected', result: 'attachments-total-too-large', reason: 'Total attachment size exceeds allowed limit' });
          return NextResponse.json({ error: 'Total attachment size exceeds allowed limit' }, { status: 413 });
        }

        const resolvedContentType =
          attachmentRef.contentType ||
          attachmentResponse.headers.get('content-type') ||
          'application/octet-stream';

        // Resolve the best available filename for this attachment.
        // Priority: Mailgun metadata name → Content-Disposition response header → generic fallback.
        // Always ensure the filename carries a file extension so email clients and
        // operating systems can determine the correct application to open the file.
        const contentDispositionHeader = attachmentResponse.headers.get('content-disposition') || '';
        const filenameFromHeader = parseFilenameFromContentDisposition(contentDispositionHeader);
        const rawFilename = attachmentRef.name || filenameFromHeader || `attachment-${i + 1}`;
        const resolvedFilename = ensureFilenameExtension(rawFilename, resolvedContentType);

        const contentId = contentIdFieldMap.get(attachmentRef.url) || contentIdFieldMap.get(safeUrl);
        attachments.push({
          filename: resolvedFilename,
          content,
          contentType: resolvedContentType,
          ...(contentId ? { contentId } : {}),
        });
      }
    } else {
      for (let i = 1; i <= attachmentCount; i++) {
        const rawFile = formData.get(`attachment-${i}`);
        if (!rawFile) continue;
        if (!(rawFile instanceof File)) {
          console.warn(`attachment-${i}: expected a File but received ${typeof rawFile}; skipping`);
          continue;
        }
        const file = rawFile;

        if (file.size > MAX_ATTACHMENT_BYTES) {
          await updateWebhookLog({ status: 'rejected', result: 'attachment-too-large', reason: `Attachment too large: ${file.name}` });
          return NextResponse.json({ error: `Attachment too large: ${file.name}` }, { status: 413 });
        }

        totalAttachmentBytes += file.size;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
          await updateWebhookLog({ status: 'rejected', result: 'attachments-total-too-large', reason: 'Total attachment size exceeds allowed limit' });
          return NextResponse.json({ error: 'Total attachment size exceeds allowed limit' }, { status: 413 });
        }

        const fieldName = `attachment-${i}`;
        const contentId = contentIdFieldMap.get(fieldName);
        const fileContentType = file.type || 'application/octet-stream';
        attachments.push({
          filename: ensureFilenameExtension(file.name, fileContentType),
          content: await file.arrayBuffer(),
          contentType: fileContentType,
          ...(contentId ? { contentId } : {}),
        });
      }
    }

    if (normalizedRecipients.length === 0) {
      await updateWebhookLog({ status: 'rejected', result: 'missing-recipient', reason: 'Missing recipient' });
      return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
    }

    // Firestore `in` queries support up to 10 values per query.
    const recipientChunks: string[][] = [];
    for (let i = 0; i < normalizedRecipients.length; i += 10) {
      recipientChunks.push(normalizedRecipients.slice(i, i + 10));
    }

    let userDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
    for (const chunk of recipientChunks) {
      const usersSnap = await db
        .collection('users')
        .where('assignedEmail', 'in', chunk)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!usersSnap.empty) {
        userDoc = usersSnap.docs[0];
        break;
      }
    }

    if (!userDoc) {
      const recipientsText = normalizedRecipients.join(',');
      console.log(`No active user found for email(s): ${recipientsText}`);
      await updateWebhookLog({ status: 'skipped', result: 'no-matching-user', reason: `No active user found for recipient(s): ${recipientsText}` });
      return NextResponse.json({ message: `No active user found for email(s): ${recipientsText}` });
    }

    const userData = userDoc.data();
    const userId = userDoc.id;
    finalUserId = userId;
    const matchedRecipient = (userData.assignedEmail as string) || normalizedRecipients[0];

    if (isLikelyMailLoop(formData, sender, (userData.email as string) || '')) {
      const skippedRef = await db.collection('emailLogs').add({
        toAddress: matchedRecipient,
        fromAddress: sender,
        subject,
        receivedAt: Timestamp.now(),
        status: 'skipped',
        userId,
        originalBody: emailBody,
        errorMessage: 'Possible mail loop detected; message not forwarded',
        ...(messageId ? { messageId } : {}),
      });
      await sendEmailCompletionPushNotification(userId, sender, subject, skippedRef.id, 'skipped');
      await updateWebhookLog({ status: 'skipped', result: 'mail-loop-detected', reason: 'Possible mail loop detected', linked: { emailLogId: skippedRef.id } });
      return NextResponse.json({ message: 'Possible mail loop detected, email skipped' });
    }

    // Deduplicate: if a log entry already exists for this Message-Id, skip reprocessing
    if (messageId) {
      const existingLog = await db
        .collection('emailLogs')
        .where('messageId', '==', messageId)
        .where('userId', '==', userId)
        .limit(1)
        .get();
      if (!existingLog.empty) {
        console.log(`Duplicate email detected (Message-Id: ${messageId}), skipping`);
        await updateWebhookLog({
          status: 'skipped',
          result: 'duplicate-message-id',
          reason: `Duplicate email detected (Message-Id: ${messageId})`,
          linked: { emailLogId: existingLog.docs[0].id },
        });
        return NextResponse.json({ message: 'Duplicate email, already processed' });
      }
    }

    // If the user has disabled their Postino address, register the email as skipped
    if (userData.isAddressEnabled === false) {
      const skippedRef = await db.collection('emailLogs').add({
        toAddress: matchedRecipient,
        fromAddress: sender,
        subject,
        receivedAt: Timestamp.now(),
        status: 'skipped',
        userId,
        originalBody: emailBody,
        ...(messageId ? { messageId } : {}),
      });
      await sendEmailCompletionPushNotification(userId, sender, subject, skippedRef.id, 'skipped');
      console.log(`User ${userId} has address disabled, email skipped`);
      await updateWebhookLog({ status: 'skipped', result: 'address-disabled', reason: `User ${userId} has address disabled`, linked: { emailLogId: skippedRef.id } });
      return NextResponse.json({ message: 'Address disabled, email skipped' });
    }

    // Determine whether attachments can be serialized into the Firestore job document.
    // Firestore has a 1 MB per-document limit; we reserve ~500 KB for attachment base64 data.
    // Attachments exceeding this threshold are uploaded to Firebase Storage instead.
    const totalBase64Size = attachments.reduce(
      (sum, att) => sum + Math.ceil((att.content.byteLength * 4) / 3),
      0
    );
    const attachmentsTooLargeForQueue = attachments.length > 0 && totalBase64Size > MAX_QUEUE_ATTACHMENT_BYTES;

    // Serialize attachments for queue storage.
    // Small attachments (≤ MAX_QUEUE_ATTACHMENT_BYTES total) are stored inline as base64.
    // Large attachments are uploaded to Firebase Storage and referenced by path.
    let serializedAttachments: SerializedAttachment[] | undefined;
    if (attachments.length > 0) {
      if (!attachmentsTooLargeForQueue) {
        // All attachments fit in Firestore — inline base64.
        serializedAttachments = attachments.map((att) => ({
          filename: att.filename,
          contentBase64: Buffer.from(att.content).toString('base64'),
          contentType: att.contentType,
          ...(att.contentId ? { contentId: att.contentId } : {}),
        }));
      }
      // (Large attachments are handled below after the log record is created.)
    }

    const processingMode = 'queued';

    const logRef = await db.collection('emailLogs').add({
      toAddress: matchedRecipient,
      fromAddress: sender,
      subject,
      receivedAt: Timestamp.now(),
      status: 'received',
      userId,
      originalBody: emailBody,
      processingMode,
      ...(ccHeader ? { ccAddress: ccHeader } : {}),
      ...(messageId ? { messageId } : {}),
      ...(attachments.length > 0 ? {
        attachmentCount: attachments.length,
        attachmentNames: attachments.map((a) => a.filename),
      } : {}),
    });
    logId = logRef.id;
    await updateWebhookLog({ status: 'accepted', result: 'log-created', linked: { emailLogId: logRef.id } });

    // Upload large attachments to Firebase Storage now that we have the logId for the path.
    if (attachmentsTooLargeForQueue) {
      const uploaded: Array<SerializedAttachment | null> = await Promise.all(
        attachments.map(async (att, i): Promise<SerializedAttachment | null> => {
          const storagePath = await uploadAttachmentToStorage(att, logRef.id, i);
          if (!storagePath) {
            // Storage upload failed — fall back to synchronous processing so the
            // attachment is not silently dropped.
            return null;
          }
          return {
            filename: att.filename,
            contentType: att.contentType,
            storagePath,
            ...(att.contentId ? { contentId: att.contentId } : {}),
          };
        })
      );

      const allUploaded = uploaded.every((r) => r !== null);
      if (!allUploaded) {
        // One or more uploads failed — process synchronously to avoid data loss.
        await logRef.update({ status: 'processing', processingStartedAt: Timestamp.now() });
        const syncPayload: QueuedInboundPayload = {
          logId: logRef.id,
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
        };
        await processQueuedInboundPayload(syncPayload, attachments);
        await updateWebhookLog({
          status: 'processed',
          result: 'sync-attachments-fallback',
          reason: 'Large attachment storage upload failed; processed synchronously',
          linked: { emailLogId: logRef.id },
        });
        return NextResponse.json({ success: true, mode: 'sync-attachments' });
      }

      serializedAttachments = uploaded.filter((att): att is SerializedAttachment => att !== null);
    }

    const payload: QueuedInboundPayload = {
      logId: logRef.id,
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
      ...(serializedAttachments ? { attachments: serializedAttachments } : {}),
    };

    const queued = await enqueueEmailJob(payload, nonceId);
    if (!queued) {
      // Queue insertion conflict should be rare (nonce already unique), but keep deterministic behavior.
      await updateWebhookLog({
        status: 'skipped',
        result: 'duplicate-job',
        reason: 'Duplicate queue job, already queued',
        linked: { emailLogId: logRef.id, jobId: nonceId },
      });
      return NextResponse.json({ message: 'Duplicate job, already queued' });
    }

    await updateWebhookLog({
      status: 'queued',
      result: 'queued',
      reason: null,
      linked: { emailLogId: logRef.id, jobId: nonceId },
    });

    // Kick off a background processing pass after a short delay — non-blocking.
    scheduleProcessingTrigger(request);

    return NextResponse.json({ success: true, queued: true });
  } catch (error) {
    console.error('Inbound email enqueue error:', error);
    await updateWebhookLog({
      status: 'error',
      result: 'internal-error',
      reason: error instanceof Error ? error.message : String(error),
    });
    if (logId) {
      try {
        await adminDb().collection('emailLogs').doc(logId).update({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        if (finalUserId) {
          await sendEmailCompletionPushNotification(finalUserId, finalSender, finalSubject, logId, 'error');
        }
      } catch (updateError) {
        console.error('Failed to update email log with error status:', updateError);
      }
    }
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
