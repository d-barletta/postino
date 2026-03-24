import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { sendEmail, type EmailAttachment } from '@/lib/email';

type TestEmailPayload = {
  to?: string;
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

// Minimal 8×8 red PNG used as the inline test image.
// Generated with: ImageMagick `convert -size 8x8 xc:red png:- | base64`
const INLINE_TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVQI12P8z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg==';

/** Convert a Node.js Buffer to a plain ArrayBuffer without sharing the underlying pool. */
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    const body = (await request.json().catch(() => ({}))) as TestEmailPayload;

    const recipient = trimString(body.to) || admin.email || '';
    if (!recipient) {
      return NextResponse.json(
        { error: 'Missing recipient email. Enter a test recipient.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const subject = `Postino Mailgun test (${nowIso})`;
    const inlineCid = 'postino-test-inline';

    // Regular (non-inline) text attachment — confirms non-inline delivery works.
    const textAttachment: EmailAttachment = {
      filename: 'postino-test-attachment.txt',
      content: bufferToArrayBuffer(
        Buffer.from(
          [
            'Postino attachment delivery test',
            '',
            'If you can read this file, non-inline attachments are delivered correctly.',
            '',
            `Timestamp: ${nowIso}`,
          ].join('\n'),
          'utf-8'
        )
      ),
      contentType: 'text/plain',
    };

    // Inline PNG attachment — its CID is referenced in the HTML body below.
    const inlineAttachment: EmailAttachment = {
      filename: 'postino-inline.png',
      content: bufferToArrayBuffer(Buffer.from(INLINE_TEST_PNG_BASE64, 'base64')),
      contentType: 'image/png',
      contentId: inlineCid,
    };

    const htmlBody = [
      '<p>This is a Mailgun test email sent from Postino admin settings using the same',
      'sending function as real email forwarding.</p>',
      `<p><strong>Time:</strong> ${nowIso}</p>`,
      '<p>This email includes:</p>',
      '<ul>',
      '<li>A non-inline attachment: <code>postino-test-attachment.txt</code></li>',
      '<li>An inline image (should appear as a small red square below)</li>',
      '</ul>',
      '<p>If either attachment is missing in the received email, check your Mailgun',
      'configuration and the Postino attachment pipeline.</p>',
      `<p><img src="cid:${inlineCid}" alt="Postino inline test" width="64" height="64"`,
      'style="width:64px;height:64px;border:1px solid #ccc;display:block;" /></p>',
    ].join('\n');

    const textBody = [
      'This is a Mailgun test email sent from Postino admin settings using the same',
      'sending function as real email forwarding.',
      '',
      `Time: ${nowIso}`,
      '',
      'This email includes:',
      '  - A non-inline attachment: postino-test-attachment.txt',
      '  - An inline image',
      '',
      'If attachments are missing, check your Mailgun configuration and the Postino',
      'attachment pipeline.',
    ].join('\n');

    await sendEmail({
      to: recipient,
      subject,
      html: htmlBody,
      text: textBody,
      attachments: [textAttachment, inlineAttachment],
    });

    return NextResponse.json({
      success: true,
      message: `Test email with attachments sent to ${recipient}`,
      recipient,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    if (msg === 'Forbidden' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}