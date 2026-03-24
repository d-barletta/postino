import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage, adminMessaging } from '@/lib/firebase-admin';
import { processEmailWithAgent } from '@/lib/agent';
import { sendEmail, type EmailAttachment } from '@/lib/email';
import type { RuleForProcessing } from '@/lib/openrouter';

/**
 * Attachment serialized for Firestore storage (base64-encoded content or Firebase Storage ref).
 * Small attachments are stored inline as base64; large attachments are uploaded to Firebase
 * Storage and referenced here by `storagePath`.
 */
export interface SerializedAttachment {
  filename: string;
  contentType: string;
  /** Content-ID for inline attachments referenced via `cid:` in the HTML body. */
  contentId?: string;
  /** Base64-encoded content for small attachments stored directly in Firestore. */
  contentBase64?: string;
  /**
   * Firebase Storage path for large attachments that cannot fit in a Firestore document.
   * The file is uploaded on inbound and deleted after forwarding.
   */
  storagePath?: string;
}

export interface QueuedInboundPayload {
  logId: string;
  userId: string;
  userEmail: string;
  matchedRecipient: string;
  sender: string;
  replyToHeader: string;
  subject: string;
  emailBody: string;
  bodyHtml: string;
  bodyPlain: string;
  messageId: string;
  /**
   * Attachments for Firestore queue storage.
   * Small attachments are stored inline as base64 (`contentBase64`).
   * Large attachments are stored in Firebase Storage and referenced by `storagePath`.
   */
  attachments?: SerializedAttachment[];
}

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

/**
 * Recursively strips `undefined` values so payloads are always valid Firestore documents.
 * Firestore rejects undefined both in objects and arrays.
 */
function sanitizeForFirestore<T>(value: T): T {
  if (value === null) return value;

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined) as T;
  }

  if (typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, sanitizeForFirestore(nested)] as const)
      .filter(([, nested]) => nested !== undefined);

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

/**
 * Upload an attachment to Firebase Storage for temporary queue storage.
 * Returns the storage path that can later be used to retrieve the file.
 * Falls back gracefully (returns null) when Storage is not configured.
 */
export async function uploadAttachmentToStorage(
  attachment: EmailAttachment,
  logId: string,
  index: number
): Promise<string | null> {
  try {
    const storage = adminStorage();
    const bucket = storage.bucket();
    const storagePath = `email-attachments/${logId}/${index}-${attachment.filename}`;
    const file = bucket.file(storagePath);
    await file.save(Buffer.from(attachment.content), {
      contentType: attachment.contentType,
      metadata: { cacheControl: 'no-cache' },
    });
    return storagePath;
  } catch (err) {
    console.error('Failed to upload attachment to Firebase Storage:', err);
    return null;
  }
}

/**
 * Download an attachment from Firebase Storage.
 * Returns null if the download fails.
 */
async function downloadAttachmentFromStorage(storagePath: string): Promise<ArrayBuffer | null> {
  try {
    const storage = adminStorage();
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);
    const [contents] = await file.download();
    const buf = Buffer.from(contents);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch (err) {
    console.error(`Failed to download attachment from Firebase Storage (${storagePath}):`, err);
    return null;
  }
}

/**
 * Delete an attachment from Firebase Storage after it has been forwarded.
 * Errors are logged but not re-thrown.
 */
async function deleteAttachmentFromStorage(storagePath: string): Promise<void> {
  try {
    const storage = adminStorage();
    const bucket = storage.bucket();
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error(`Failed to delete attachment from Firebase Storage (${storagePath}):`, err);
  }
}

/**
 * Send a web push notification to all of a user's registered FCM tokens.
 * Stale tokens that are rejected by FCM are removed from Firestore automatically.
 * Errors are caught and logged so they never block the main email-processing flow.
 */
async function sendEmailPushNotification(
  userId: string,
  sender: string,
  subject: string,
  logId: string,
  status: 'forwarded' | 'error' | 'skipped'
): Promise<void> {
  try {
    const db = adminDb();
    const userSnap = await db.collection('users').doc(userId).get();
    const fcmTokens = userSnap.data()?.fcmTokens as string[] | undefined;
    if (!fcmTokens || fcmTokens.length === 0) return;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const iconUrl = appUrl ? `${appUrl}/web-app-manifest-192x192.png` : '/web-app-manifest-192x192.png';
    const relativeEmailUrl = `/dashboard?tab=emails&selectedEmail=${encodeURIComponent(logId)}`;
    const absoluteEmailUrl = appUrl ? `${appUrl}${relativeEmailUrl}` : '';

    const titleByStatus: Record<'forwarded' | 'error' | 'skipped', string> = {
      forwarded: `Email forwarded from ${sender}`,
      error: `Email processing failed for ${sender}`,
      skipped: `Email skipped from ${sender}`,
    };

    const response = await adminMessaging().sendEachForMulticast({
      notification: {
        title: titleByStatus[status],
        body: subject,
      },
      webpush: {
        notification: {
          icon: iconUrl,
          badge: appUrl ? `${appUrl}/favicon-96x96.png` : '/favicon-96x96.png',
          tag: `postino-email-${logId}`,
        },
        ...(absoluteEmailUrl ? { fcmOptions: { link: absoluteEmailUrl } } : {}),
      },
      data: {
        url: relativeEmailUrl,
        logId,
        status,
      },
      tokens: fcmTokens,
    });

    // Remove tokens that FCM reports as invalid so they don't accumulate.
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((r, i) => {
        const code = r.error?.code ?? '';
        if (
          !r.success &&
          (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token')
        ) {
          invalidTokens.push(fcmTokens[i]);
        }
      });
      if (invalidTokens.length > 0) {
        await db
          .collection('users')
          .doc(userId)
          .update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
      }
    }
  } catch (err) {
    console.error('Failed to send push notification:', err);
  }
}

export async function processQueuedInboundPayload(
  payload: QueuedInboundPayload,
  attachments?: EmailAttachment[]
): Promise<void> {
  const db = adminDb();
  const logRef = db.collection('emailLogs').doc(payload.logId);

  // If no attachments were provided directly (queue path), deserialize from payload.
  // Attachments may be stored as inline base64 (small) or in Firebase Storage (large).
  let effectiveAttachments: EmailAttachment[] | undefined;
  if (attachments !== undefined) {
    effectiveAttachments = attachments;
  } else if (payload.attachments && payload.attachments.length > 0) {
    const resolved = await Promise.all(
      payload.attachments.map(async (att) => {
        let content: ArrayBuffer | null = null;

        if (att.storagePath) {
          content = await downloadAttachmentFromStorage(att.storagePath);
        } else if (att.contentBase64) {
          const buf = Buffer.from(att.contentBase64, 'base64');
          content = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        }

        if (!content) {
          console.warn(`Skipping attachment "${att.filename}": content unavailable`);
          return null;
        }

        return {
          filename: att.filename,
          content,
          contentType: att.contentType,
          ...(att.contentId ? { contentId: att.contentId } : {}),
        };
      })
    );
    const validAttachments = resolved.filter((a): a is EmailAttachment => a !== null);
    effectiveAttachments = validAttachments.length > 0 ? validAttachments : undefined;
  }

  const rulesSnap = await db
    .collection('rules')
    .where('userId', '==', payload.userId)
    .where('isActive', '==', true)
    .get();

  // Sort rules by sortOrder ASC (user-defined), then by createdAt ASC as tiebreaker,
  // so rules are always applied in a deterministic order that matches what the user sees.
  const allRules = rulesSnap.docs
    .sort((a, b) => {
      const aOrder = typeof a.data().sortOrder === 'number' ? (a.data().sortOrder as number) : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.data().sortOrder === 'number' ? (b.data().sortOrder as number) : Number.MAX_SAFE_INTEGER;
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
      matchesPattern(payload.sender, r.matchSender) &&
      matchesPattern(payload.subject, r.matchSubject) &&
      matchesPattern(payload.emailBody, r.matchBody)
  );

  // Collect attachment names for the LLM prompt and the notification box.
  const attachmentNames = effectiveAttachments && effectiveAttachments.length > 0
    ? effectiveAttachments.map((att) => att.filename).filter((name): name is string => Boolean(name))
    : undefined;

  const result = await processEmailWithAgent(
    payload.userId,
    payload.logId,
    payload.sender,
    payload.subject,
    payload.emailBody,
    matchingRules,
    payload.bodyHtml !== '',
    undefined,
    attachmentNames?.length ? attachmentNames : undefined,
  );

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const originalEmailUrl = appUrl ? `${appUrl}/email/original/${payload.logId}` : null;

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

  // Build an attachment line for the notification box when the email has attachments.
  const attachmentDisplayHtml =
    attachmentNames && attachmentNames.length > 0
      ? `<div style="color: #4b5563; font-size: 13px; margin-top: 4px;">Attachments: ${attachmentNames.map((n) => `<span style="font-weight: bold;">${escapeHtml(n)}</span>`).join(', ')}</div>`
      : '';

  const notificationBox = `<div style="clear: both; margin-top: 24px; font-family: Arial, sans-serif; font-size: 13px; color: #4b5563; line-height: 1.4;">
        <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 0;">
        <div style="background: #f0f4ff; padding: 12px 16px; border-left: 3px solid #6366f1;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 8px;">
            <tr>
              <td style="padding: 0; vertical-align: middle;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="-6.4 -6.4 140.8 140.8" width="20" height="20" style="vertical-align: middle; margin-right: 6px;"><path d="M114,106.5H29V36.8h70c13.8,0,25,11.2,25,25v34.7C124,102,119.5,106.5,114,106.5z" fill="#efd957"/><path d="M99,36.8H29v10h70c13.8,0,25,11.2,25,25v-10C124,48,112.8,36.8,99,36.8z" fill="#E7E7E7"/><path d="M44,106.5H14c-5.5,0-10-4.5-10-10v-35c0-13.8,11.2-25,25-25h0c13.8,0,25,11.2,25,25v35C54,102,49.5,106.5,44,106.5z" fill="#E7E7E7"/><polygon fill="#efd957" points="71.5,71.5 71.5,21.5 99.7,21.5 99.7,36.5 79.7,36.5 79.7,71.5"/><path d="M14,108h30c6.3,0,11.5-5.2,11.5-11.5v-35c0-10.2-5.8-19.1-14.3-23.5h23.4c0.8,0,1.5-0.7,1.5-1.5S65.5,35,64.7,35H29C14.4,35,2.5,46.9,2.5,61.5v35C2.5,102.8,7.7,108,14,108z M5.5,61.5C5.5,48.5,16,38,29,38s23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H14c-4.7,0-8.5-3.8-8.5-8.5V61.5z" fill="#494949"/><path d="M14,63h30c0.8,0,1.5-0.7,1.5-1.5S44.8,60,44,60H14c-0.8,0-1.5,0.7-1.5,1.5S13.2,63,14,63z" fill="#494949"/><path d="M101.2,21.5c0-0.8-0.7-1.5-1.5-1.5H71.5c-0.8,0-1.5,0.7-1.5,1.5v45.9c0,3.1,2.5,5.6,5.6,5.6s5.6-2.5,5.6-5.6V38H99c13,0,23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H59c-0.8,0-1.5,0.7-1.5,1.5s0.7,1.5,1.5,1.5h55c6.3,0,11.5-5.2,11.5-11.5v-35c0-13.9-10.7-25.3-24.3-26.4V21.5z M79.7,35c-0.8,0-1.5,0.7-1.5,1.5v30.9c0,1.4-1.2,2.6-2.6,2.6S73,68.8,73,67.4V23h25.2v12H79.7z" fill="#494949"/></svg>
                <strong style="color: #4b5563; font-size: 13px;">Postino processed this email</strong>
              </td>
              ${originalEmailUrl ? `<td align="right" style="padding: 0; vertical-align: middle; white-space: nowrap;"><a href="${escapeHtml(originalEmailUrl)}" style="color: #4b5563; text-decoration: underline; font-size: 13px;">View original</a></td>` : ''}
            </tr>
          </table>
          <div style="margin-bottom: 6px; color: #4b5563; font-size: 13px;">Original from: ${escapeHtml(payload.sender)}</div>
          <div style="color: #4b5563; font-size: 13px;">Rule: ${ruleDisplayHtml}</div>
          ${attachmentDisplayHtml}
        </div>
      </div>`;

  // Inject the notification box outside the original email HTML body.
  // If result.body is a complete HTML document (has a closing </body> tag), insert
  // the box just before </body> so it appears as the last top-level sibling element
  // inside <body>, outside any tables or containers from the original email.
  // Appending after </html> would create invalid HTML that email clients may
  // re-render by moving the box inside the original email's container structures.
  // For HTML fragments (no </body> tag), append after the fragment as before.
  // Use case-insensitive matching and target the last occurrence to handle
  // emails with non-lowercase tags or unusual formatting.
  const lastBodyClose = [...result.body.matchAll(/<\/body>/gi)].pop();
  const emailHtml = lastBodyClose
    ? result.body.slice(0, lastBodyClose.index) + notificationBox + result.body.slice(lastBodyClose.index)
    : result.body + notificationBox;

  await sendEmail({
    to: payload.userEmail,
    subject: stripCrlf(result.subject),
    html: emailHtml,
    replyTo: payload.replyToHeader || payload.sender,
    attachments: effectiveAttachments && effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
    headers: {
      'X-Postino-Processed': 'true',
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  });

  const safeTrace = result.trace ? sanitizeForFirestore(result.trace) : undefined;

  const finalStatus: 'forwarded' | 'error' = result.parseError?.includes('forwarded as-is')
    ? 'error'
    : 'forwarded';

  await logRef.update({
    processedAt: Timestamp.now(),
    status: finalStatus,
    ruleApplied: result.ruleApplied,
    tokensUsed: result.tokensUsed,
    estimatedCost: result.estimatedCost,
    processedBody: result.body,
    ...(safeTrace ? { agentTrace: safeTrace } : {}),
    ...(result.parseError ? { errorMessage: result.parseError } : {}),
  });

  // Clean up any attachments stored in Firebase Storage now that they have been forwarded
  // and the log has been successfully updated. Deleting only after the log update ensures
  // that if the update fails and the job is retried, the attachments are still available.
  if (payload.attachments) {
    await Promise.all(
      payload.attachments
        .filter((att) => att.storagePath)
        .map((att) => deleteAttachmentFromStorage(att.storagePath!))
    );
  }

  // Fire-and-forget push notification — runs after the log update and storage cleanup
  // so that a notification failure never blocks or rolls back the email-processing result.
  await sendEmailPushNotification(payload.userId, payload.sender, result.subject, payload.logId, finalStatus);
}

export async function sendEmailCompletionPushNotification(
  userId: string,
  sender: string,
  subject: string,
  logId: string,
  status: 'forwarded' | 'error' | 'skipped'
): Promise<void> {
  await sendEmailPushNotification(userId, sender, subject, logId, status);
}
