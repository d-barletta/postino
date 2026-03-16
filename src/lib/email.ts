import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { adminDb } from './firebase-admin';
export { generateAssignedEmail } from './email-utils';

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

export async function sendEmail(options: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const db = adminDb();
  const settingsSnap = await db.collection('settings').doc('global').get();
  const settings = settingsSnap.data();

  const fromAddress = options.from || settings?.smtpFrom || process.env.SMTP_FROM || 'postino@postino.app';

  const transporter = await createTransport();
  await transporter.sendMail({
    from: fromAddress,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
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
