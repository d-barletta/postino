import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processEmailWithAgent } from '@/lib/agent';
import type { RuleForProcessing } from '@/lib/openrouter';
import { sendEmail, verifyMailgunSignature, EmailAttachment } from '@/lib/email';
import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';

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
  let logRef: DocumentReference | null = null;
  try {
    const formData = await request.formData();

    const timestamp = formData.get('timestamp') as string;
    const token = formData.get('token') as string;
    const signature = formData.get('signature') as string;

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
    const replyToHeader = stripCrlf((formData.get('Reply-To') as string) || '');
    const subject = stripCrlf((formData.get('subject') as string) || '');
    const bodyHtml = (formData.get('body-html') as string) || '';
    const bodyPlain = (formData.get('body-plain') as string) || '';
    const emailBody = bodyHtml || bodyPlain;
    const messageId = stripCrlf((formData.get('Message-Id') as string) || '');
    const rawAttachmentCount = parseInt((formData.get('attachment-count') as string) || '0', 10);
    const attachmentCount = Number.isFinite(rawAttachmentCount) ? rawAttachmentCount : 0;

    const attachments: EmailAttachment[] = [];
    for (let i = 1; i <= attachmentCount; i++) {
      const file = formData.get(`attachment-${i}`) as File | null;
      if (file) {
        attachments.push({
          filename: file.name,
          content: await file.arrayBuffer(),
          contentType: file.type || 'application/octet-stream',
        });
      }
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

    logRef = await db.collection('emailLogs').add({
      toAddress: matchedRecipient,
      fromAddress: sender,
      subject,
      receivedAt: Timestamp.now(),
      status: 'processing',
      userId,
      originalBody: emailBody,
      ...(messageId ? { messageId } : {}),
    });

    const rulesSnap = await db
      .collection('rules')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    // Sort rules by sortOrder ASC (user-defined), then by createdAt ASC as tiebreaker,
    // so rules are always applied in a deterministic order that matches what the user sees.
    const allRules = rulesSnap.docs
      .sort((a, b) => {
        const aOrder = typeof a.data().sortOrder === 'number' ? a.data().sortOrder as number : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.data().sortOrder === 'number' ? b.data().sortOrder as number : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0);
      })
      .map((d) => ({
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

    const result = await processEmailWithAgent(userId, logRef.id, sender, subject, emailBody, matchingRules, bodyHtml !== '');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const originalEmailUrl = appUrl
      ? `${appUrl}/email/original/${logRef.id}`
      : null;

    // Render each matching rule name as a clickable link to its edit page.
    // When no rules matched (or no app URL is configured) fall back to plain text.
    const ruleDisplayHtml =
      matchingRules.length > 0 && appUrl
        ? matchingRules
            .map(
              (rule) =>
                `<a href="${escapeHtml(`${appUrl}/dashboard?editRule=${rule.id}`)}" style="font-weight: bold; text-decoration: underline;">${escapeHtml(rule.name)}</a>`
            )
            .join(', ')
        : `<strong>${escapeHtml(result.ruleApplied)}</strong>`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${result.body}
      <div class="gmail_signature" style="margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      <div style="background: #f0f4ff; padding: 12px 16px; border-radius: 0px; font-size: 13px; color: #4b5563;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="-6.4 -6.4 140.8 140.8" width="20" height="20" style="vertical-align: middle; margin-right: 6px;"><path d="M114,106.5H29V36.8h70c13.8,0,25,11.2,25,25v34.7C124,102,119.5,106.5,114,106.5z" fill="#EFD957"/><path d="M99,36.8H29v10h70c13.8,0,25,11.2,25,25v-10C124,48,112.8,36.8,99,36.8z" fill="#E7E7E7"/><path d="M44,106.5H14c-5.5,0-10-4.5-10-10v-35c0-13.8,11.2-25,25-25h0c13.8,0,25,11.2,25,25v35C54,102,49.5,106.5,44,106.5z" fill="#E7E7E7"/><polygon fill="#EFD957" points="71.5,71.5 71.5,21.5 99.7,21.5 99.7,36.5 79.7,36.5 79.7,71.5"/><path d="M14,108h30c6.3,0,11.5-5.2,11.5-11.5v-35c0-10.2-5.8-19.1-14.3-23.5h23.4c0.8,0,1.5-0.7,1.5-1.5S65.5,35,64.7,35H29C14.4,35,2.5,46.9,2.5,61.5v35C2.5,102.8,7.7,108,14,108z M5.5,61.5C5.5,48.5,16,38,29,38s23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H14c-4.7,0-8.5-3.8-8.5-8.5V61.5z" fill="#494949"/><path d="M14,63h30c0.8,0,1.5-0.7,1.5-1.5S44.8,60,44,60H14c-0.8,0-1.5,0.7-1.5,1.5S13.2,63,14,63z" fill="#494949"/><path d="M101.2,21.5c0-0.8-0.7-1.5-1.5-1.5H71.5c-0.8,0-1.5,0.7-1.5,1.5v45.9c0,3.1,2.5,5.6,5.6,5.6s5.6-2.5,5.6-5.6V38H99c13,0,23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H59c-0.8,0-1.5,0.7-1.5,1.5s0.7,1.5,1.5,1.5h55c6.3,0,11.5-5.2,11.5-11.5v-35c0-13.9-10.7-25.3-24.3-26.4V21.5z M79.7,35c-0.8,0-1.5,0.7-1.5,1.5v30.9c0,1.4-1.2,2.6-2.6,2.6S73,68.8,73,67.4V23h25.2v12H79.7z" fill="#494949"/></svg>
            <strong>Postino processed this email</strong>
          </div>
          ${originalEmailUrl ? `<a href="${escapeHtml(originalEmailUrl)}" style="text-decoration: underline; white-space: nowrap; margin-left: 12px;">View original email</a>` : ''}
        </div>
        <div style="margin-bottom: 8px;">
          Original from: ${escapeHtml(sender)}
        </div>
        Rule: ${ruleDisplayHtml}
      </div>
      </div>
      </div>
    `;

    await sendEmail({
      to: userData.email,
      subject: stripCrlf(result.subject),
      html: emailHtml,
      replyTo: replyToHeader || sender,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    await logRef.update({
      processedAt: Timestamp.now(),
      status: 'forwarded',
      ruleApplied: result.ruleApplied,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      processedBody: result.body,
      ...(result.parseError ? { errorMessage: result.parseError } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inbound email processing error:', error);
    if (logRef) {
      try {
        await logRef.update({
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
