import nodemailer from 'nodemailer';
import crypto from 'crypto';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
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
  const mailgun = new Mailgun(FormData);
  const client = mailgun.client({
    username: 'api',
    key: options.apiKey,
    url: options.baseUrl,
  });

  const messageData: Parameters<typeof client.messages.create>[1] = {
    from: stripCrlf(options.from),
    to: [stripCrlf(options.to)],
    subject: stripCrlf(options.subject),
    html: options.html,
    text: options.text,
  };

  if (options.replyTo) {
    messageData['h:Reply-To'] = stripCrlf(options.replyTo);
  }

  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      messageData[`h:${stripCrlf(key)}`] = stripCrlf(String(value));
    });
  }

  if (options.attachments && options.attachments.length > 0) {
    const regularAttachments: Array<{ data: Buffer; filename: string; contentType: string }> = [];
    const inlineAttachments: Array<{ data: Buffer; filename: string; contentType: string }> = [];

    for (const attachment of options.attachments) {
      // Keep inline CID filenames aligned with cid: references used in HTML.
      const normalized = {
        data: Buffer.from(attachment.content),
        filename: attachment.contentId || attachment.filename || 'attachment',
        contentType: attachment.contentType,
      };

      if (attachment.contentId) {
        inlineAttachments.push(normalized);
      } else {
        regularAttachments.push(normalized);
      }
    }

    if (regularAttachments.length === 1) {
      messageData.attachment = regularAttachments[0];
    } else if (regularAttachments.length > 1) {
      messageData.attachment = regularAttachments;
    }

    if (inlineAttachments.length === 1) {
      messageData.inline = inlineAttachments[0];
    } else if (inlineAttachments.length > 1) {
      messageData.inline = inlineAttachments;
    }
  }

  try {
    await client.messages.create(options.domain, messageData);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Mailgun send failed: ${detail}`);
  }
}

export async function sendEmail(options: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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

  const fromAddress = stripCrlf(
    options.from || settings?.smtpFrom || process.env.SMTP_FROM || `Postino <noreply@${mailgunDomain || 'postino.pro'}>`
  );
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
            content: Buffer.from(att.content),
            contentType: att.contentType,
            // Explicitly encode binary attachments as base64 to avoid any ambiguity.
            encoding: 'base64',
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
