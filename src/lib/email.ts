import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { adminDb } from './firebase-admin';
export { generateAssignedEmail } from './email-utils';

const MAILGUN_TIMESTAMP_MAX_SKEW_SECONDS = 5 * 60;

/** Strip CR and LF characters to prevent email header (CRLF) injection. */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export async function createTransport() {
  const db = adminDb();
  const settingsSnap = await db.collection('settings').doc('global').get();

  if (!settingsSnap.exists) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  const settings = settingsSnap.data()!;
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort || 587,
    secure: settings.smtpPort === 465,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
  });
}

export interface EmailAttachment {
  filename: string;
  content: ArrayBuffer;
  contentType: string;
  /** Content-ID for inline attachments (e.g. images embedded via `cid:` in HTML). */
  contentId?: string;
}

async function sendViaMailgun(options: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  apiKey: string;
  domain: string;
  baseUrl: string;
}): Promise<void> {
  const url = `${options.baseUrl}/v3/${options.domain}/messages`;

  const body = new FormData();
  body.append('from', stripCrlf(options.from));
  body.append('to', stripCrlf(options.to));
  body.append('subject', stripCrlf(options.subject));
  body.append('html', options.html);
  body.append('text', options.text);
  // Disable Mailgun click and open tracking so links are not rewritten
  // through the Mailgun tracking proxy (e.g. http://[track]/https://...).
  body.append('o:tracking', 'no');

  if (options.replyTo) {
    body.append('h:Reply-To', stripCrlf(options.replyTo));
  }

  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      body.append(`h:${stripCrlf(key)}`, stripCrlf(String(value)));
    });
  }

  if (options.attachments) {
    for (const attachment of options.attachments) {
      // Convert ArrayBuffer to Buffer first for reliable binary serialization in Node.js.
      const buf = Buffer.from(attachment.content);
      const blob = new Blob([buf], { type: attachment.contentType });
      if (attachment.contentId) {
        // Inline attachment: Mailgun's send API uses the blob's name as the CID value.
        // The HTML body already contains `src="cid:<contentId>"` references, so the name
        // must equal the stripped content-id so Mailgun can match them up correctly.
        body.append('inline', blob, attachment.contentId);
      } else {
        // Non-inline attachment: use the filename, falling back to a generic name to
        // prevent Mailgun from silently dropping attachments that have no filename.
        body.append('attachment', blob, attachment.filename || 'attachment');
      }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${options.apiKey}`).toString('base64')}`,
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Mailgun send failed (${response.status}): ${detail}`);
  }
}

export async function sendEmail(options: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Original sender's display name, used to expand the `{senderName}` placeholder in `smtpFromName`. */
  senderName?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}): Promise<void> {
  const db = adminDb();
  const settingsSnap = await db.collection('settings').doc('global').get();
  const settings = settingsSnap.data();

  const mailgunApiKey = settings?.mailgunApiKey || process.env.MAILGUN_API_KEY || '';
  const mailgunDomain =
    settings?.mailgunSandboxEmail ||
    settings?.mailgunDomain ||
    process.env.MAILGUN_SANDBOX_EMAIL ||
    '';
  const mailgunBaseUrl =
    settings?.mailgunBaseUrl || process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

  let resolvedFrom: string;
  if (options.from) {
    resolvedFrom = options.from;
  } else if (settings?.smtpFromEmail) {
    // Build from address from split name + email fields
    const rawName: string = settings.smtpFromName || '';
    const safeSenderName = stripCrlf(options.senderName || '');
    const expandedName = rawName.replace(/\{senderName\}/g, safeSenderName).trim();
    const emailPart = settings.smtpFromEmail as string;
    resolvedFrom = expandedName ? `${expandedName} <${emailPart}>` : emailPart;
  } else {
    resolvedFrom =
      settings?.smtpFrom || process.env.SMTP_FROM || `Postino <noreply@${mailgunDomain || 'postino.pro'}>`;
  }
  const fromAddress = stripCrlf(resolvedFrom);
  const toAddress = stripCrlf(options.to);
  const subjectLine = stripCrlf(options.subject);

  const text = options.text || options.html.replace(/<[^>]*>/g, '');

  if (mailgunApiKey && mailgunDomain) {
    await sendViaMailgun({
      to: toAddress,
      from: fromAddress,
      subject: subjectLine,
      html: options.html,
      text,
      replyTo: options.replyTo,
      attachments: options.attachments,
      headers: options.headers,
      apiKey: mailgunApiKey,
      domain: mailgunDomain,
      baseUrl: mailgunBaseUrl,
    });
    return;
  }

  // Fallback to SMTP
  const transporter = await createTransport();
  await transporter.sendMail({
    from: fromAddress,
    to: toAddress,
    subject: subjectLine,
    html: options.html,
    text,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.replyTo ? { replyTo: stripCrlf(options.replyTo) } : {}),
    ...(options.attachments && options.attachments.length > 0
      ? {
          attachments: options.attachments.map((att) => ({
            // Provide a fallback filename so SMTP servers never receive a nameless part.
            filename: att.filename || 'attachment',
            // Buffer.from(ArrayBuffer) gives nodemailer the raw binary; it encodes
            // it as base64 in the MIME transfer layer automatically. Do NOT set
            // `encoding: 'base64'` here — that field is only for when `content` is
            // already a base64-encoded string, and setting it on a Buffer causes
            // some nodemailer versions to double-encode the data.
            content: Buffer.from(att.content),
            contentType: att.contentType,
            ...(att.contentId
              ? { cid: att.contentId }
              : {
                  // Explicitly mark non-inline attachments so all SMTP/email clients
                  // treat them as downloadable files rather than embedded content.
                  contentDisposition: 'attachment',
                }),
          })),
        }
      : {}),
  });
}

export function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  apiKey: string
): boolean {
  if (!timestamp || !token || !signature || !apiKey) return false;

  const encodedToken = crypto
    .createHmac('sha256', apiKey)
    .update(timestamp + token)
    .digest('hex');

  const expected = Buffer.from(encodedToken, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

export function isMailgunTimestampFresh(timestamp: string, nowMs = Date.now()): boolean {
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return false;

  const nowSeconds = Math.floor(nowMs / 1000);
  return Math.abs(nowSeconds - timestampSeconds) <= MAILGUN_TIMESTAMP_MAX_SKEW_SECONDS;
}
