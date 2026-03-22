import { NextRequest, NextResponse, after } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { verifyMailgunSignature, isMailgunTimestampFresh, type EmailAttachment } from '@/lib/email';
import { enqueueEmailJob } from '@/lib/email-jobs';
import { processQueuedInboundPayload, type QueuedInboundPayload } from '@/lib/inbound-processing';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS_BYTES = 20 * 1024 * 1024;
const LOOP_MARKER_HEADER = 'x-postino-processed';
const ASYNC_TRIGGER_BATCH_SIZE = 1;

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
    await new Promise<void>((resolve) => setTimeout(resolve, 10_000));

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
  try {
    const formData = await request.formData();

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    if (!timestamp || !token || !signature) {
      return NextResponse.json({ error: 'Missing webhook signature fields' }, { status: 400 });
    }

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();

    if (settings?.maintenanceMode === true) {
      console.log('Maintenance mode is active, email not forwarded');
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
      return NextResponse.json({ error: 'Webhook signature key is not configured' }, { status: 503 });
    }

    if (!isMailgunTimestampFresh(timestamp)) {
      return NextResponse.json({ error: 'Stale webhook timestamp' }, { status: 403 });
    }

    if (!verifyMailgunSignature(timestamp, token, signature, mailgunWebhookSigningKey)) {
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
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;
    const messageId = stripCrlf((formData.get('Message-Id') as string) || '');

    const rawAttachmentCount = parseInt((formData.get('attachment-count') as string) || '0', 10);
    const attachmentCount = Number.isFinite(rawAttachmentCount)
      ? Math.max(0, rawAttachmentCount)
      : 0;

    if (attachmentCount > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Too many attachments (max ${MAX_ATTACHMENTS})` }, { status: 413 });
    }

    const attachments: EmailAttachment[] = [];
    let totalAttachmentBytes = 0;
    for (let i = 1; i <= attachmentCount; i++) {
      const file = formData.get(`attachment-${i}`) as File | null;
      if (!file) continue;

      if (file.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `Attachment too large: ${file.name}` }, { status: 413 });
      }

      totalAttachmentBytes += file.size;
      if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
        return NextResponse.json({ error: 'Total attachment size exceeds allowed limit' }, { status: 413 });
      }

      attachments.push({
        filename: file.name,
        content: await file.arrayBuffer(),
        contentType: file.type || 'application/octet-stream',
      });
    }

    if (normalizedRecipients.length === 0) {
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
      return NextResponse.json({ message: `No active user found for email(s): ${recipientsText}` });
    }

    const userData = userDoc.data();
    const userId = userDoc.id;
    const matchedRecipient = (userData.assignedEmail as string) || normalizedRecipients[0];

    if (isLikelyMailLoop(formData, sender, (userData.email as string) || '')) {
      await db.collection('emailLogs').add({
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
        return NextResponse.json({ message: 'Duplicate email, already processed' });
      }
    }

    // If the user has disabled their Postino address, register the email as skipped
    if (userData.isAddressEnabled === false) {
      await db.collection('emailLogs').add({
        toAddress: matchedRecipient,
        fromAddress: sender,
        subject,
        receivedAt: Timestamp.now(),
        status: 'skipped',
        userId,
        originalBody: emailBody,
        ...(messageId ? { messageId } : {}),
      });
      console.log(`User ${userId} has address disabled, email skipped`);
      return NextResponse.json({ message: 'Address disabled, email skipped' });
    }

    const logRef = await db.collection('emailLogs').add({
      toAddress: matchedRecipient,
      fromAddress: sender,
      subject,
      receivedAt: Timestamp.now(),
      status: 'received',
      userId,
      originalBody: emailBody,
      processingMode: attachments.length > 0 ? 'sync-attachments' : 'queued',
      ...(messageId ? { messageId } : {}),
    });
    logId = logRef.id;

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
    };

    // Firestore jobs cannot safely store large binary attachments.
    // Keep attachment-bearing messages on the synchronous path to preserve behavior.
    if (attachments.length > 0) {
      await logRef.update({ status: 'processing', processingStartedAt: Timestamp.now() });
      await processQueuedInboundPayload(payload, attachments);
      return NextResponse.json({ success: true, mode: 'sync-attachments' });
    }

    const queued = await enqueueEmailJob(payload, nonceId);
    if (!queued) {
      // Queue insertion conflict should be rare (nonce already unique), but keep deterministic behavior.
      return NextResponse.json({ message: 'Duplicate job, already queued' });
    }

    // Kick off a background processing pass after a short delay — non-blocking.
    scheduleProcessingTrigger(request);

    return NextResponse.json({ success: true, queued: true });
  } catch (error) {
    console.error('Inbound email enqueue error:', error);
    if (logId) {
      try {
        await adminDb().collection('emailLogs').doc(logId).update({
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch (updateError) {
        console.error('Failed to update email log with error status:', updateError);
      }
    }
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
