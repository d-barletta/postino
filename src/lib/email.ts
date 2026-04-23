import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
export { generateAssignedEmail } from './email-utils';

const MAILGUN_TIMESTAMP_MAX_SKEW_SECONDS = 5 * 60;

/** Strip CR and LF characters to prevent email header (CRLF) injection. */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

/**
 * Quote a display name for use in an RFC 5322 `From` header.
 * If the name contains any special characters that would break the
 * `Display Name <address@domain>` format, the name is wrapped in double
 * quotes with internal backslashes and double-quotes escaped.
 */
function quoteDisplayName(name: string): string {
  // RFC 5322 specials that require the display name to be quoted.
  if (/[()<>\[\]:;@\\,"]/.test(name)) {
    return '"' + name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return name;
}

export async function createTransport() {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = settingsRow?.data as Record<string, unknown> | null;

  if (!settings) {
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

  return nodemailer.createTransport({
    host: typeof settings.smtpHost === 'string' ? settings.smtpHost : process.env.SMTP_HOST,
    port:
      typeof settings.smtpPort === 'number'
        ? settings.smtpPort
        : parseInt(process.env.SMTP_PORT || '587'),
    secure:
      typeof settings.smtpPort === 'number'
        ? settings.smtpPort === 465
        : process.env.SMTP_SECURE === 'true',
    auth: {
      user: typeof settings.smtpUser === 'string' ? settings.smtpUser : process.env.SMTP_USER,
      pass: typeof settings.smtpPass === 'string' ? settings.smtpPass : process.env.SMTP_PASS,
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
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = (settingsRow?.data as Record<string, unknown> | null) ?? null;

  const mailgunApiKey =
    (typeof settings?.mailgunApiKey === 'string' ? settings.mailgunApiKey : '') ||
    process.env.MAILGUN_API_KEY ||
    '';
  const mailgunDomain =
    (typeof settings?.mailgunSandboxEmail === 'string' ? settings.mailgunSandboxEmail : '') ||
    (typeof settings?.mailgunDomain === 'string' ? settings.mailgunDomain : '') ||
    process.env.MAILGUN_SANDBOX_EMAIL ||
    '';
  const mailgunBaseUrl =
    (typeof settings?.mailgunBaseUrl === 'string' ? settings.mailgunBaseUrl : '') ||
    process.env.MAILGUN_BASE_URL ||
    'https://api.mailgun.net';

  let resolvedFrom: string;
  if (options.from) {
    resolvedFrom = options.from;
  } else if (typeof settings?.smtpFromEmail === 'string' && settings.smtpFromEmail) {
    // Build from address from split name + email fields
    const rawName = typeof settings.smtpFromName === 'string' ? settings.smtpFromName : '';
    const safeSenderName = stripCrlf(options.senderName || '');
    const expandedName = rawName.replace(/\{senderName\}/g, safeSenderName).trim();
    const emailPart = settings.smtpFromEmail;
    resolvedFrom = expandedName ? `${quoteDisplayName(expandedName)} <${emailPart}>` : emailPart;
  } else {
    resolvedFrom =
      (typeof settings?.smtpFrom === 'string' ? settings.smtpFrom : '') ||
      process.env.SMTP_FROM ||
      `Postino <noreply@${mailgunDomain || 'postino.pro'}>`;
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
  apiKey: string,
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

export async function notifyAdminsNewSignup(params: {
  email: string;
  assignedEmail: string;
  createdAt: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: admins } = await supabase.from('users').select('email').eq('is_admin', true);

    if (!admins || admins.length === 0) return;

    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settings = (settingsRow?.data as Record<string, unknown> | null) ?? null;

    const smtpFromEmail =
      typeof settings?.smtpFromEmail === 'string' ? settings.smtpFromEmail.trim() : '';
    const smtpFrom = typeof settings?.smtpFrom === 'string' ? settings.smtpFrom.trim() : '';
    const smtpFromMatch = smtpFrom.match(/<([^>]+)>/);
    const fallbackDomain =
      (typeof settings?.mailgunSandboxEmail === 'string' ? settings.mailgunSandboxEmail : '') ||
      (typeof settings?.mailgunDomain === 'string' ? settings.mailgunDomain : '') ||
      process.env.MAILGUN_SANDBOX_EMAIL ||
      '';
    const senderEmail =
      smtpFromEmail || smtpFromMatch?.[1] || `noreply@${fallbackDomain || 'postino.pro'}`;
    const fromAddress = `📬 Postino <${senderEmail}>`;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const adminUrl = appUrl ? `${appUrl}/admin` : 'https://postino.pro/admin';

    const formattedDate = new Date(params.createdAt).toUTCString();

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>New user signup</title>
  </head>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background-color:#f8f9fa;">
    <div style="max-width:500px;margin:0 auto;padding:24px 12px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:40px;">
        <svg viewBox="-6.4 -6.4 140.8 140.8" width="64" height="64" style="max-width:100%;height:auto;background-color:#ffffff;border-radius:9999px;padding:8px;box-sizing:border-box;">
          <path d="M114,106.5H29V36.8h70c13.8,0,25,11.2,25,25v34.7C124,102,119.5,106.5,114,106.5z" fill="#efd957" />
          <path d="M99,36.8H29v10h70c13.8,0,25,11.2,25,25v-10C124,48,112.8,36.8,99,36.8z" fill="#E7E7E7" />
          <path d="M44,106.5H14c-5.5,0-10-4.5-10-10v-35c0-13.8,11.2-25,25-25h0c13.8,0,25,11.2,25,25v35C54,102,49.5,106.5,44,106.5z" fill="#E7E7E7" />
          <polygon fill="#efd957" points="71.5,71.5 71.5,21.5 99.7,21.5 99.7,36.5 79.7,36.5 79.7,71.5" />
          <path d="M14,108h30c6.3,0,11.5-5.2,11.5-11.5v-35c0-10.2-5.8-19.1-14.3-23.5h23.4c0.8,0,1.5-0.7,1.5-1.5S65.5,35,64.7,35H29C14.4,35,2.5,46.9,2.5,61.5v35C2.5,102.8,7.7,108,14,108z M5.5,61.5C5.5,48.5,16,38,29,38s23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H14c-4.7,0-8.5-3.8-8.5-8.5V61.5z" fill="#494949" />
          <path d="M14,63h30c0.8,0,1.5-0.7,1.5-1.5S44.8,60,44,60H14c-0.8,0-1.5,0.7-1.5,1.5S13.2,63,14,63z" fill="#494949" />
          <path d="M101.2,21.5c0-0.8-0.7-1.5-1.5-1.5H71.5c-0.8,0-1.5,0.7-1.5,1.5v45.9c0,3.1,2.5,5.6,5.6,5.6s5.6-2.5,5.6-5.6V38H99c13,0,23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H59c-0.8,0-1.5,0.7-1.5,1.5s0.7,1.5,1.5,1.5h55c6.3,0,11.5-5.2,11.5-11.5v-35c0-13.9-10.7-25.3-24.3-26.4V21.5z M79.7,35c-0.8,0-1.5,0.7-1.5,1.5v30.9c0,1.4-1.2,2.6-2.6,2.6S73,68.8,73,67.4V23h25.2v12H79.7z" fill="#494949" />
        </svg>
      </div>
      <div style="background:white;border-radius:8px;padding:25px 18px;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="margin:0 0 20px 0;font-size:24px;font-weight:600;color:#171717;">New user signed up</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <tr>
            <td style="padding:8px 0;font-weight:600;width:40%;vertical-align:top;">Email</td>
            <td style="padding:8px 0;color:#6b7280;">${params.email}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Assigned email</td>
            <td style="padding:8px 0;color:#6b7280;">${params.assignedEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Signed up at</td>
            <td style="padding:8px 0;color:#6b7280;">${formattedDate}</td>
          </tr>
        </table>
        <div style="margin-top:28px;text-align:center;">
          <a href="${adminUrl}" style="display:inline-block;padding:12px 32px;background-color:#efd957;color:#171717;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">Open admin panel</a>
        </div>
      </div>
      <div style="text-align:center;margin-top:30px;font-size:12px;color:#9ca3af;">
        <p style="margin:0">© 2026 Postino. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
    const text = `New user signed up.\n\nEmail: ${params.email}\nAssigned email: ${params.assignedEmail}\nSigned up at: ${formattedDate}\n\nAdmin panel: ${adminUrl}`;

    await Promise.all(
      admins.map((admin) =>
        sendEmail({
          to: admin.email as string,
          from: fromAddress,
          subject: `New user signup: ${params.email}`,
          html,
          text,
        }).catch((err) => console.error('[email] Failed to notify admin of new signup:', err)),
      ),
    );
  } catch (error) {
    console.error('[email] notifyAdminsNewSignup failed:', error);
  }
}
