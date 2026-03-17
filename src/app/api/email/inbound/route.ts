import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processEmailWithRules, RuleForProcessing } from '@/lib/openrouter';
import { sendEmail, verifyMailgunSignature } from '@/lib/email';
import { Timestamp } from 'firebase-admin/firestore';

/** Escape special HTML characters to prevent HTML injection in email templates. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Strip CR and LF characters to prevent email header (CRLF) injection. */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

/** Returns true if the value contains the pattern (case-insensitive), or if pattern is empty. */
function matchesPattern(value: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) return true;
  return value.toLowerCase().includes(pattern.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();
    const mailgunWebhookSigningKey =
      settings?.mailgunWebhookSigningKey ||
      process.env.MAILGUN_WEBHOOK_SIGNING_KEY ||
      settings?.mailgunApiKey ||
      process.env.MAILGUN_API_KEY ||
      '';
    const mailgunDomain =
      settings?.mailgunSandboxEmail ||
      settings?.mailgunDomain ||
      process.env.MAILGUN_SANDBOX_EMAIL ||
      '';
    const mailgunBaseUrl =
      settings?.mailgunBaseUrl || process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';

    if (
      mailgunWebhookSigningKey &&
      !verifyMailgunSignature(timestamp, token, signature, mailgunWebhookSigningKey)
    ) {
      return NextResponse.json(
        {
          error: 'Invalid signature',
          hint: `Check Mailgun webhook signing key and endpoint (${mailgunBaseUrl})`,
        },
        { status: 403 }
      );
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
    const subject = stripCrlf((formData.get('subject') as string) || '');
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;

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

    const logRef = await db.collection('emailLogs').add({
      toAddress: matchedRecipient,
      fromAddress: sender,
      subject,
      receivedAt: Timestamp.now(),
      status: 'processing',
      userId,
      originalBody: emailBody,
    });

    const rulesSnap = await db
      .collection('rules')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const allRules = rulesSnap.docs.map((d) => ({
      id: d.id,
      name: (d.data().name as string) || d.id,
      text: d.data().text as string,
      matchSender: (d.data().matchSender as string) || '',
      matchSubject: (d.data().matchSubject as string) || '',
      matchBody: (d.data().matchBody as string) || '',
    }));

    // Filter rules based on pattern matching against the incoming email
    const matchingRules: RuleForProcessing[] = allRules.filter(
      (r) =>
        matchesPattern(sender, r.matchSender) &&
        matchesPattern(subject, r.matchSubject) &&
        matchesPattern(emailBody, r.matchBody)
    );

    const result = await processEmailWithRules(sender, subject, emailBody, matchingRules);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const originalEmailUrl = appUrl
      ? `${appUrl}/email/original/${logRef.id}`
      : null;

    // Find the rule that was applied (by name) to get its ID for the edit link
    const appliedRule = matchingRules.find((r) => r.name === result.ruleApplied);
    const editRuleUrl = appUrl && appliedRule
      ? `${appUrl}/dashboard?editRule=${appliedRule.id}`
      : appUrl
      ? `${appUrl}/dashboard`
      : null;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f0f4ff; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: #4b5563;">
          <strong>📮 Postino processed this email</strong><br>
          Original from: ${escapeHtml(sender)} | Rule: <strong>${escapeHtml(result.ruleApplied)}</strong>${editRuleUrl ? ` | <a href="${escapeHtml(editRuleUrl)}" style="color: #4f46e5; text-decoration: underline;">Edit rule</a>` : ''}${originalEmailUrl ? `<br><a href="${escapeHtml(originalEmailUrl)}" style="color: #4f46e5; text-decoration: underline; margin-top: 4px; display: inline-block;">View original email</a>` : ''}
        </div>
        ${result.body}
      </div>
    `;

    await sendEmail({
      to: userData.email,
      subject: stripCrlf(result.subject),
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
