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
    const rawAttachmentCountForLog = parseInt((formData.get('attachment-count') as string) || '0', 10);
    const attachmentCountForLog = Number.isFinite(rawAttachmentCountForLog)
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

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    if (!timestamp || !token || !signature) {
      await updateWebhookLog({ status: 'rejected', result: 'missing-signature-fields', reason: 'Missing webhook signature fields' });
      return NextResponse.json({ error: 'Missing webhook signature fields' }, { status: 400 });
    }

    if (settings?.maintenanceMode === true) {
      console.log('Maintenance mode is active, email not forwarded');
      await updateWebhookLog({ status: 'skipped', result: 'maintenance-mode', reason: 'Maintenance mode is active' });
      return NextResponse.json({ message: 'Service is under maintenance. Email not forwarded.' });
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
    const replyToHeader = stripCrlf((formData.get('Reply-To') as string) || '');
    const subject = stripCrlf((formData.get('subject') as string) || '');
    finalSender = sender;
    finalSubject = subject;
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;
    const messageId = stripCrlf((formData.get('Message-Id') as string) || '');

    const rawAttachmentCount = parseInt((formData.get('attachment-count') as string) || '0', 10);
    const attachmentCount = Number.isFinite(rawAttachmentCount)
      ? Math.max(0, rawAttachmentCount)
      : 0;

    if (attachmentCount > MAX_ATTACHMENTS) {
      await updateWebhookLog({ status: 'rejected', result: 'too-many-attachments', reason: `Too many attachments (max ${MAX_ATTACHMENTS})` });
      return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` }, { status: 413 });
    }

    // Parse content-id-map to identify inline attachments (e.g. CID-referenced images).
    // Mailgun sends this as JSON: { "<cid@host>": "attachment-N" } or { "<cid@host>": ["attachment-N"] }
    // We invert it to a map of field name → stripped content-id for quick lookup.
    const contentIdFieldMap = new Map<string, string>();
    const contentIdMapRaw = formData.get('content-id-map') as string | null;
    if (contentIdMapRaw) {
      try {
        const parsed = JSON.parse(contentIdMapRaw) as Record<string, string | string[]>;
        for (const [cid, fields] of Object.entries(parsed)) {
          const strippedCid = cid.replace(/^<|>$/, '');
          const fieldNames = Array.isArray(fields) ? fields : [fields];
          for (const fieldName of fieldNames) {
            if (typeof fieldName === 'string') {
              contentIdFieldMap.set(fieldName, strippedCid);
            }
          }
        }
      } catch {
        // Ignore malformed content-id-map; inline images will fall back to regular attachments.
      }
    }

    const attachments: EmailAttachment[] = [];
    let totalAttachmentBytes = 0;
    for (let i = 1; i <= attachmentCount; i++) {
      const rawFile = formData.get(`attachment-${i}`);
      // Guard against non-File values (e.g. string URLs returned by Mailgun's Store route).
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
      attachments.push({
        filename: file.name,
        content: await file.arrayBuffer(),
        contentType: file.type || 'application/octet-stream',
        ...(contentId ? { contentId } : {}),
      });
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
      ...(messageId ? { messageId } : {}),
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
