import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { adminDb } from './firebase-admin';
export { generateAssignedEmail } from './email-utils';

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
}

async function sendViaMailgun(options: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
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

  if (options.replyTo) {
    body.append('h:Reply-To', stripCrlf(options.replyTo));
  }

  if (options.attachments) {
    for (const attachment of options.attachments) {
      const blob = new Blob([attachment.content], { type: attachment.contentType });
      body.append('attachment', blob, attachment.filename);
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
  attachments?: EmailAttachment[];
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
    options.from || settings?.smtpFrom || process.env.SMTP_FROM || `Postino <noreply@${mailgunDomain || 'postino.app'}>`
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
    ...(options.replyTo ? { replyTo: stripCrlf(options.replyTo) } : {}),
    ...(options.attachments && options.attachments.length > 0
      ? {
          attachments: options.attachments.map((att) => ({
            filename: att.filename,
            content: Buffer.from(att.content),
            contentType: att.contentType,
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
  const encodedToken = crypto
    .createHmac('sha256', apiKey)
    .update(timestamp + token)
    .digest('hex');
  return encodedToken === signature;
}
