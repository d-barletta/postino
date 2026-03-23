import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

type MailgunTestPayload = {
  to?: string;
  mailgunApiKey?: string;
  mailgunDomain?: string;
  mailgunSandboxEmail?: string;
  mailgunBaseUrl?: string;
  smtpFrom?: string;
};

type DecodedAdmin = {
  uid: string;
  email?: string;
};

async function verifyAdmin(request: NextRequest): Promise<DecodedAdmin> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);
  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return { uid: decoded.uid, email: decoded.email };
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMailgunDomain(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.includes('@') ? trimmed.split('@')[1] || '' : trimmed;
}

function normalizeBaseUrl(value: string): string {
  if (!value) return 'https://api.mailgun.net';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    const body = (await request.json().catch(() => ({}))) as MailgunTestPayload;

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data() || {};

    const apiKey =
      trimString(body.mailgunApiKey) ||
      trimString(settings.mailgunApiKey) ||
      trimString(process.env.MAILGUN_API_KEY);

    const domain = normalizeMailgunDomain(
      trimString(body.mailgunSandboxEmail) ||
      trimString(body.mailgunDomain) ||
      trimString(settings.mailgunSandboxEmail) ||
      trimString(settings.mailgunDomain) ||
      trimString(process.env.MAILGUN_SANDBOX_EMAIL)
    );

    const baseUrl = normalizeBaseUrl(
      trimString(body.mailgunBaseUrl) ||
      trimString(settings.mailgunBaseUrl) ||
      trimString(process.env.MAILGUN_BASE_URL) ||
      'https://api.mailgun.net'
    );

    const recipient = trimString(body.to) || admin.email || '';
    if (!recipient) {
      return NextResponse.json(
        { error: 'Missing recipient email. Enter a test recipient.' },
        { status: 400 }
      );
    }

    if (!apiKey || !domain) {
      return NextResponse.json(
        {
          error:
            'Mailgun is not fully configured. Provide Mailgun API Key and Mailgun Domain/Sandbox Email.',
        },
        { status: 400 }
      );
    }

    const fromAddress =
      trimString(body.smtpFrom) ||
      trimString(settings.smtpFrom) ||
      `Postino <noreply@${domain}>`;

    const nowIso = new Date().toISOString();
    const subject = `Postino Mailgun test (${nowIso})`;
    const textBody = [
      'This is a Mailgun test email from Postino admin settings.',
      '',
      `Time: ${nowIso}`,
      `Domain: ${domain}`,
      `Base URL: ${baseUrl}`,
    ].join('\n');

    const form = new FormData();
    form.append('from', fromAddress);
    form.append('to', recipient);
    form.append('subject', subject);
    form.append('text', textBody);

    const res = await fetch(`${baseUrl}/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      },
      body: form,
    });

    const detail = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Mailgun test failed (${res.status})`,
          detail,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${recipient}`,
      detail,
      recipient,
      domain,
      baseUrl,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}