import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processEmailWithRules } from '@/lib/openrouter';
import { sendEmail, verifyMailgunSignature } from '@/lib/email';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();
    const mailgunApiKey = settings?.mailgunApiKey || process.env.MAILGUN_API_KEY || '';
    const mailgunDomain = settings?.mailgunDomain || process.env.MAILGUN_SANDBOX_EMAIL || '';
    const mailgunBaseUrl = process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

    if (mailgunApiKey && !verifyMailgunSignature(timestamp, token, signature, mailgunApiKey)) {
      return NextResponse.json(
        {
          error: 'Invalid signature',
          hint: `Check Mailgun API key and endpoint (${mailgunBaseUrl})`,
        },
        { status: 403 }
      );
    }

    const recipientRaw = (formData.get('recipient') as string) || '';
    const recipient = recipientRaw.trim().toLowerCase();
    const normalizedRecipient =
      recipient.includes('@') || !mailgunDomain
        ? recipient
        : `${recipient}@${mailgunDomain}`.toLowerCase();
    const sender = formData.get('sender') as string;
    const subject = formData.get('subject') as string;
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;

    const usersSnap = await db
      .collection('users')
      .where('assignedEmail', '==', normalizedRecipient)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      console.log(`No active user found for email: ${normalizedRecipient}`);
      return NextResponse.json({ message: 'No user found' });
    }

    const userDoc = usersSnap.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    const logRef = await db.collection('emailLogs').add({
      toAddress: normalizedRecipient,
      fromAddress: sender,
      subject,
      receivedAt: Timestamp.now(),
      status: 'processing',
      userId,
    });

    const rulesSnap = await db
      .collection('rules')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const rules = rulesSnap.docs.map((d) => d.data().text as string);

    const result = await processEmailWithRules(sender, subject, emailBody, rules);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f0f4ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: #4b5563;">
          <strong>📮 Postino processed this email</strong><br>
          Original from: ${sender} | Rule: ${result.ruleApplied}
        </div>
        ${result.body}
      </div>
    `;

    await sendEmail({
      to: userData.email,
      subject: result.subject,
      html: emailHtml,
    });

    await logRef.update({
      processedAt: Timestamp.now(),
      status: 'forwarded',
      ruleApplied: result.ruleApplied,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      processedBody: result.body,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inbound email processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
