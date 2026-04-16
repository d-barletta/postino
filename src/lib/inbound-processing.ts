import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  processEmailWithAgent,
  analyzeEmailContent,
  getUserMemory,
  saveUserMemory,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
  buildMemoryEntryFromAnalysis,
} from '@/agents/email-agent';
import { processEmailWithAgent as processEmailWithSandbox } from '@/agents/sandbox-email-agent';
import { sendEmail, type EmailAttachment } from '@/lib/email';
import type { RuleForProcessing } from '@/lib/openrouter';
import {
  addUserCreditsUsage,
  computeMonthlyCreditsLimit,
  dollarsToCredits,
  getUtcMonthKey,
  normalizeUserCreditsSnapshot,
  resolveCreditSettings,
} from '@/lib/credits';

/**
 * Attachment serialized for queue storage.
 * New jobs store all attachments in Supabase Storage and reference them by `storagePath`.
 * `contentBase64` remains supported only so older queued jobs can still be processed.
 */
export interface SerializedAttachment {
  filename: string;
  contentType: string;
  /** Content-ID for inline attachments referenced via `cid:` in the HTML body. */
  contentId?: string;
  /** Legacy base64 content kept for backward compatibility with older queued jobs. */
  contentBase64?: string;
  /**
   * Supabase Storage path for queued attachments.
   * All new queued attachments, including inline CID-backed parts, use this field.
   */
  storagePath?: string;
}

export interface QueuedInboundPayload {
  logId: string;
  userId: string;
  userEmail: string;
  matchedRecipient: string;
  sender: string;
  /** The raw `From` header value from the inbound message. May contain display names and multiple comma-separated addresses. */
  fromHeader?: string;
  replyToHeader: string;
  subject: string;
  emailBody: string;
  bodyHtml: string;
  bodyPlain: string;
  messageId: string;
  /** CC recipients from the original email header. */
  ccAddress?: string;
  /** BCC recipients from the original email header. */
  bccAddress?: string;
  /**
   * Attachments for queue storage.
   * New jobs store all attachments in Supabase Storage and reference them by `storagePath`.
   * `contentBase64` is still supported for older jobs already in the queue.
   */
  attachments?: SerializedAttachment[];
  /**
   * When true, the email is processed for AI analysis and memory update only.
   * Rules and forwarding are skipped. Status is saved as 'skipped'.
   */
  aiAnalysisOnly?: boolean;
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

/**
 * Parse a comma-separated RFC 5322 address list into individual address strings,
 * correctly handling commas that appear inside quoted display names or angle brackets,
 * and backslash-escaped characters within quoted strings.
 */
function parseAddressList(value: string): string[] {
  const addresses: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngles = false;
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '\\' && inQuotes) {
      // Backslash escape: consume both the backslash and the next character literally
      current += ch;
      i++;
      if (i < value.length) {
        current += value[i];
        i++;
      }
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '<' && !inQuotes) inAngles = true;
    else if (ch === '>' && !inQuotes) inAngles = false;
    else if (ch === ',' && !inQuotes && !inAngles) {
      const trimmed = current.trim();
      if (trimmed) addresses.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const trimmed = current.trim();
  if (trimmed) addresses.push(trimmed);
  return addresses;
}

/**
 * Extract the display name from a single "Name <email@example.com>" formatted address.
 * Falls back to the bare email address when no display name is present.
 */
function extractAddressDisplayName(address: string): string {
  const nameMatch = address.match(/^"?([^"<]+)"?\s*<[^>]+>/);
  if (nameMatch) return nameMatch[1].trim();
  // No display name — extract bare email address as the label
  const emailMatch = address.match(/<([^>]+)>/);
  return (emailMatch ? emailMatch[1] : address).trim();
}

/**
 * Resolve a human-readable label for the sender(s) to use in the `{senderName}` placeholder.
 *
 * - Single sender with display name → display name (e.g. "John Smith")
 * - Single sender without display name → bare email address (e.g. "john@example.com")
 * - Multiple senders → "N senders" (e.g. "3 senders")
 */
function resolveSenderDisplayValue(fromHeader: string, senderFallback: string): string {
  const source = fromHeader.trim() || senderFallback.trim();
  if (!source) return '';
  const addresses = parseAddressList(source);
  if (addresses.length > 1) return `${addresses.length} senders`;
  return extractAddressDisplayName(addresses[0] || source);
}

/** Returns true if the value contains the pattern (case-insensitive), or if pattern is empty. */
function matchesPattern(value: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) return true;
  return value.toLowerCase().includes(pattern.toLowerCase());
}

function buildForwardBodyWithoutAi(payload: QueuedInboundPayload): string {
  if (payload.bodyHtml.trim()) return payload.bodyHtml;
  const plain = payload.bodyPlain || payload.emailBody || '';
  return `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(plain)}</pre>`;
}

function sanitizeStorageFilename(filename: string, fallback: string): string {
  const basename = filename.split(/[\\/]/).pop()?.trim() ?? '';
  const sanitized = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return fallback;
  }

  return sanitized;
}

function buildAttachmentStoragePath(
  userId: string,
  emailId: string,
  attachmentNumber: number,
  filename: string,
): string {
  const safeFilename = sanitizeStorageFilename(filename, `attachment_${attachmentNumber}`);
  return `${userId}/${emailId}/attach_${attachmentNumber}/${safeFilename}`;
}

/**
 * Upload an attachment to Supabase Storage for queued email processing.
 * Returns the storage path that can later be used to retrieve the file.
 * Falls back gracefully (returns null) when Storage is not configured.
 */
export async function uploadAttachmentToStorage(
  attachment: EmailAttachment,
  userId: string,
  emailId: string,
  attachmentNumber: number,
): Promise<string | null> {
  const attachmentDetails = {
    userId,
    emailId,
    attachmentNumber,
    filename: attachment.filename,
    contentType: attachment.contentType,
    byteLength: attachment.content.byteLength,
    isInline: Boolean(attachment.contentId),
  };

  try {
    const supabase = createAdminClient();
    const storagePath = buildAttachmentStoragePath(
      userId,
      emailId,
      attachmentNumber,
      attachment.filename,
    );
    const contentBuffer = Buffer.from(attachment.content);

    const { error } = await supabase.storage
      .from('email-attachments')
      .upload(storagePath, contentBuffer, {
        contentType: attachment.contentType,
        upsert: false,
      });

    if (error) {
      console.error('Failed to upload attachment to Supabase Storage', {
        ...attachmentDetails,
        storagePath,
        error: error.message,
      });
      return null;
    }

    return storagePath;
  } catch (err) {
    console.error('Failed to upload attachment to Supabase Storage', {
      ...attachmentDetails,
      error: err,
    });
    return null;
  }
}

/**
 * Download an attachment from Supabase Storage.
 * Returns null if the download fails.
 */
async function downloadAttachmentFromStorage(storagePath: string): Promise<ArrayBuffer | null> {
  try {
    const supabase = createAdminClient();
    const { data: blob, error } = await supabase.storage
      .from('email-attachments')
      .download(storagePath);
    if (error || !blob) {
      console.error(`Failed to download attachment from Supabase Storage (${storagePath}):`, error);
      return null;
    }
    return blob.arrayBuffer();
  } catch (err) {
    console.error(`Failed to download attachment from Supabase Storage (${storagePath}):`, err);
    return null;
  }
}

/**
 * Delete an attachment from Supabase Storage after it has been forwarded.
 * Errors are logged but not re-thrown.
 */
export async function deleteAttachmentFromStorage(storagePath: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.storage.from('email-attachments').remove([storagePath]);
  } catch (err) {
    console.error(`Failed to delete attachment from Supabase Storage (${storagePath}):`, err);
  }
}

/**
 * Delete payload snapshot files for the given mailgun_webhook_logs IDs.
 * Each log stores its payload at `mailgun-webhook-logs/{id}/payload.json`.
 * Non-existent paths are silently ignored by Supabase Storage.
 * Errors are logged but not re-thrown.
 */
export async function deleteWebhookLogStorageFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const supabase = createAdminClient();
    const paths = ids.map((id) => `mailgun-webhook-logs/${id}/payload.json`);
    const BATCH = 100;
    for (let i = 0; i < paths.length; i += BATCH) {
      await supabase.storage.from('email-attachments').remove(paths.slice(i, i + BATCH));
    }
  } catch (err) {
    console.error('Failed to delete webhook log storage files:', err);
  }
}

/**
 * Send a web push notification to the user via OneSignal external ID targeting.
 * Errors are caught and logged so they never block the main email-processing flow.
 */
async function sendEmailPushNotification(
  userId: string,
  sender: string,
  subject: string,
  logId: string,
  status: 'forwarded' | 'error' | 'skipped',
): Promise<void> {
  try {
    const oneSignalAppId = process.env.ONESIGNAL_APP_ID ?? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    console.log(
      `[Push] sendEmailPushNotification: userId=${userId} status=${status} logId=${logId}`,
      `appIdPresent=${!!oneSignalAppId} apiKeyPresent=${!!oneSignalApiKey}`,
    );
    if (!oneSignalAppId || !oneSignalApiKey) {
      console.warn(
        '[Push] sendEmailPushNotification: skipped — missing env vars:',
        !oneSignalAppId ? 'ONESIGNAL_APP_ID' : '',
        !oneSignalApiKey ? 'ONESIGNAL_API_KEY' : '',
      );
      return;
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const iconUrl = appUrl
      ? `${appUrl}/web-app-manifest-192x192.png`
      : '/web-app-manifest-192x192.png';
    const relativeEmailUrl = `/dashboard?tab=emails&selectedEmail=${encodeURIComponent(logId)}`;
    const absoluteEmailUrl = appUrl ? `${appUrl}${relativeEmailUrl}` : '';

    // Extract the human-readable display name from the sender header, e.g.
    // "John Doe <john@example.com>" → "John Doe"
    // "john@example.com" → "john@example.com"
    const senderMatch = sender.match(/^"?([^"<]+?)"?\s*<[^>]+>\s*$/);
    const senderDisplay = senderMatch ? senderMatch[1].trim() : sender.trim();

    const payload = {
      app_id: oneSignalAppId,
      target_channel: 'push',
      include_aliases: {
        external_id: [userId],
      },
      headings: {
        en: `Got an email from ${senderDisplay}`,
      },
      contents: {
        en: subject,
      },
      web_url: absoluteEmailUrl || undefined,
      chrome_web_icon: iconUrl,
      chrome_web_badge: appUrl ? `${appUrl}/favicon-96x96.png` : '/favicon-96x96.png',
      data: {
        emailPath: relativeEmailUrl,
        logId,
        status,
        tag: `postino-email-${logId}`,
      },
    };
    console.log(
      '[Push] sendEmailPushNotification: sending request to OneSignal API',
      `userId=${userId} status=${status} logId=${logId} appId=${oneSignalAppId}`,
    );

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Failed to send OneSignal push notification:', response.status, detail);
    } else {
      const responseBody = await response.text().catch(() => '');
      console.log(
        '[Push] sendEmailPushNotification: OneSignal API response OK:',
        response.status,
        responseBody,
      );
    }
  } catch (err) {
    console.error('Failed to send push notification:', err);
  }
}

export async function processQueuedInboundPayload(
  payload: QueuedInboundPayload,
  attachments?: EmailAttachment[],
): Promise<void> {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = (settingsRow?.data as Record<string, unknown> | null) ?? {};
  const creditSettings = resolveCreditSettings(settings);

  // Fetch user preferences. is_forwarding_header_enabled defaults to true when unset.
  const { data: userRow } = await supabase
    .from('users')
    .select(
      'is_forwarding_header_enabled, analysis_output_language, credits_usage_month, monthly_credits_used, monthly_credits_bonus',
    )
    .eq('id', payload.userId)
    .single();
  const isForwardingHeaderEnabled = userRow?.is_forwarding_header_enabled !== false;
  const analysisOutputLanguage =
    typeof userRow?.analysis_output_language === 'string'
      ? (userRow.analysis_output_language as string) || undefined
      : undefined;
  const currentMonth = getUtcMonthKey();
  const monthlyCredits = normalizeUserCreditsSnapshot(
    {
      credits_usage_month: userRow?.credits_usage_month as string | null | undefined,
      monthly_credits_used: userRow?.monthly_credits_used as number | null | undefined,
      monthly_credits_bonus: userRow?.monthly_credits_bonus as number | null | undefined,
    },
    currentMonth,
  );
  const monthlyCreditsLimit = computeMonthlyCreditsLimit(
    creditSettings.freeCreditsPerMonth,
    monthlyCredits.bonus,
  );
  const monthlyCreditsRemaining = Math.max(0, monthlyCreditsLimit - monthlyCredits.used);

  // AI-analysis-only mode: run analysis + memory update, skip rules and forwarding.
  if (payload.aiAnalysisOnly) {
    if (monthlyCreditsRemaining <= 0) {
      await supabase
        .from('email_logs')
        .update({
          status: 'skipped',
          processed_at: new Date().toISOString(),
          error_message:
            'AI features suspended because monthly credits are exhausted (analysis-only mode)',
        })
        .eq('id', payload.logId);
      await sendEmailPushNotification(
        payload.userId,
        payload.fromHeader || payload.sender,
        payload.subject,
        payload.logId,
        'skipped',
      );
      return;
    }

    try {
      const [analysisResult, memory] = await Promise.all([
        analyzeEmailContent(
          payload.sender,
          payload.subject,
          payload.emailBody,
          payload.bodyHtml !== '',
          undefined,
          analysisOutputLanguage,
        ),
        getUserMemory(payload.userId),
      ]);

      await supabase
        .from('email_logs')
        .update({
          processed_at: new Date().toISOString(),
          status: 'skipped',
          error_message: 'Forwarding is disabled (AI-analysis-only mode enabled)',
          tokens_used: analysisResult.tokensUsed,
          estimated_cost: analysisResult.estimatedCost,
          estimated_credits: dollarsToCredits(
            analysisResult.estimatedCost,
            creditSettings.creditsPerDollarFactor,
          ),
          ...(analysisResult.analysis
            ? {
                email_analysis:
                  analysisResult.analysis as unknown as import('@/types/supabase').Json,
              }
            : {}),
          ...(payload.attachments && payload.attachments.length > 0
            ? {
                attachments: payload.attachments as unknown as import('@/types/supabase').Json,
                attachment_count: payload.attachments.filter((a) => !a.contentId).length,
                attachment_names: payload.attachments
                  .filter((a) => !a.contentId)
                  .map((a) => a.filename),
              }
            : {}),
        })
        .eq('id', payload.logId);

      const newEntry = buildMemoryEntryFromAnalysis(
        {
          logId: payload.logId,
          date: new Date().toISOString().slice(0, 10),
          timestamp: new Date().toISOString(),
          fromAddress: payload.sender,
          subject: payload.subject,
          wasSummarized: false,
          ...(payload.attachments && payload.attachments.length > 0
            ? {
                attachmentNames: payload.attachments
                  .filter((a) => !a.contentId)
                  .map((a) => a.filename),
              }
            : {}),
        },
        analysisResult.analysis,
      );

      saveUserMemory({
        userId: payload.userId,
        entries: [...memory.entries, newEntry],
        updatedAt: new Date(),
      }).catch((err) => console.error('Failed to update user memory (AI-only):', err));

      if (settings?.memoryEnabled === true) {
        const supermemoryApiKey = (
          (settings.memoryApiKey as string | undefined) ||
          process.env.SUPERMEMORY_API_KEY ||
          ''
        ).trim();
        if (supermemoryApiKey) {
          saveToSupermemory(supermemoryApiKey, payload.userId, newEntry).catch((err) =>
            console.error('Failed to save to Supermemory (AI-only):', err),
          );
          if (payload.attachments && payload.attachments.length > 0) {
            const date = new Date().toISOString().slice(0, 10);
            Promise.allSettled(
              payload.attachments.map(async (att) => {
                if (!att.storagePath) return null;
                const content = await downloadAttachmentFromStorage(att.storagePath);
                if (!content) return null;
                return { filename: att.filename, content, contentType: att.contentType };
              }),
            ).then((results) => {
              const files = results
                .filter(
                  (r): r is PromiseFulfilledResult<EmailAttachment> =>
                    r.status === 'fulfilled' && r.value !== null,
                )
                .map((r) => r.value);
              if (files.length > 0) {
                saveAttachmentFilesToSupermemory(
                  supermemoryApiKey,
                  payload.userId,
                  payload.logId,
                  date,
                  files,
                ).catch((err) =>
                  console.error('Failed to upload attachments to Supermemory (AI-only):', err),
                );
              }
            });
          }
        }
      }

      await addUserCreditsUsage({
        userId: payload.userId,
        userEmail: payload.userEmail,
        estimatedCostUsd: analysisResult.estimatedCost,
        settingsData: settings,
      });
    } catch (err) {
      console.error('AI-analysis-only processing failed:', err);
      await supabase
        .from('email_logs')
        .update({
          status: 'skipped',
          processed_at: new Date().toISOString(),
          error_message: 'Forwarding is disabled (AI-analysis-only mode enabled)',
        })
        .eq('id', payload.logId);
    }
    await sendEmailPushNotification(
      payload.userId,
      payload.fromHeader || payload.sender,
      payload.subject,
      payload.logId,
      'skipped',
    );
    return;
  }

  // If no attachments were provided directly (queue path), deserialize from payload.
  // New jobs store all attachments in Supabase Storage; inline base64 is supported only
  // for older queued jobs that were created before the storage-only migration.
  let effectiveAttachments: EmailAttachment[] | undefined;

  console.log('[processing] resolving attachments', {
    logId: payload.logId,
    directAttachmentsProvided: attachments !== undefined,
    directAttachmentsCount: attachments?.length ?? null,
    payloadAttachmentsCount: payload.attachments?.length ?? 0,
    payloadAttachmentSummary:
      payload.attachments?.map((a) => ({
        filename: a.filename,
        hasStoragePath: Boolean(a.storagePath),
        storagePath: a.storagePath ?? null,
        hasBase64: Boolean(a.contentBase64),
      })) ?? [],
  });

  if (attachments !== undefined) {
    effectiveAttachments = attachments.length > 0 ? attachments : undefined;
    console.log('[processing] using direct attachments', {
      logId: payload.logId,
      count: effectiveAttachments?.length ?? 0,
    });
  } else if (payload.attachments && payload.attachments.length > 0) {
    const resolved = await Promise.all(
      payload.attachments.map(async (att) => {
        let content: ArrayBuffer | null = null;

        if (att.storagePath) {
          content = await downloadAttachmentFromStorage(att.storagePath);
          console.log(`[processing] storage download "${att.filename}"`, {
            logId: payload.logId,
            storagePath: att.storagePath,
            success: content !== null,
            byteLength: content?.byteLength ?? null,
          });
          if (!content) {
            console.error(
              `Failed to download attachment "${att.filename}" from Supabase Storage (path: ${att.storagePath}). ` +
                'Ensure the storage bucket exists and is accessible.',
            );
          }
        } else if (att.contentBase64) {
          try {
            const buf = Buffer.from(att.contentBase64, 'base64');
            // buf.buffer is the underlying pool ArrayBuffer; slice() copies only the
            // relevant segment so the resulting ArrayBuffer is a standalone allocation
            // with byteOffset === 0 and the correct byteLength.
            content = buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength,
            ) as ArrayBuffer;
          } catch (decodeErr) {
            console.error(
              `Failed to decode base64 content for attachment "${att.filename}":`,
              decodeErr,
            );
          }
        } else {
          console.error(
            `Attachment "${att.filename}" has neither storagePath nor contentBase64; skipping`,
          );
        }

        if (!content) {
          console.error(`Skipping attachment "${att.filename}": content unavailable`);
          return null;
        }

        return {
          filename: att.filename,
          content,
          contentType: att.contentType,
          ...(att.contentId ? { contentId: att.contentId } : {}),
        };
      }),
    );
    const validAttachments = resolved.filter((a): a is EmailAttachment => a !== null);
    if (validAttachments.length < payload.attachments.length) {
      const missingAttachments = payload.attachments
        .filter((_, index) => resolved[index] === null)
        .map((att) => ({
          filename: att.filename,
          storagePath: att.storagePath ?? null,
          hasLegacyBase64: Boolean(att.contentBase64),
          contentId: att.contentId ?? null,
        }));

      console.error(
        `${payload.attachments.length - validAttachments.length} of ${payload.attachments.length} ` +
          `attachment(s) could not be deserialized for log ${payload.logId}`,
        {
          logId: payload.logId,
          userId: payload.userId,
          missingAttachments,
        },
      );

      throw new Error(
        `Attachment deserialization failed for log ${payload.logId}; refusing to forward incomplete attachments`,
      );
    }
    effectiveAttachments = validAttachments.length > 0 ? validAttachments : undefined;
    console.log('[processing] deserialized attachments', {
      logId: payload.logId,
      expected: payload.attachments.length,
      valid: validAttachments.length,
      effectiveCount: effectiveAttachments?.length ?? 0,
    });

    await supabase
      .from('email_logs')
      .update({
        attachments: payload.attachments as unknown as import('@/types/supabase').Json,
        attachment_count: payload.attachments.filter((att) => !att.contentId).length,
        attachment_names: payload.attachments
          .filter((att) => !att.contentId)
          .map((att) => att.filename),
      })
      .eq('id', payload.logId);
  } else {
    console.log('[processing] no attachments in payload', { logId: payload.logId });
  }

  if (monthlyCreditsRemaining <= 0) {
    const forwardedBody = buildForwardBodyWithoutAi(payload);

    if (payload.messageId) {
      const forwardNonce = `forward:${crypto
        .createHash('sha256')
        .update(`${payload.userId}:${payload.messageId}`)
        .digest('hex')}`;

      const { error: nonceErr } = await supabase.from('mailgun_webhook_nonces').insert({
        id: forwardNonce,
        created_at: new Date().toISOString(),
      });

      if (nonceErr) {
        console.warn('[processing] duplicate forward prevented', {
          logId: payload.logId,
          userId: payload.userId,
          messageId: payload.messageId,
        });

        await supabase
          .from('email_logs')
          .update({
            processed_at: new Date().toISOString(),
            status: 'skipped',
            rule_applied: 'AI skipped (credits exhausted)',
            tokens_used: 0,
            estimated_cost: 0,
            estimated_credits: 0,
            processed_body: forwardedBody,
            error_message: `Duplicate forward prevented for Message-Id: ${payload.messageId}`,
          })
          .eq('id', payload.logId);

        await sendEmailPushNotification(
          payload.userId,
          payload.fromHeader || payload.sender,
          payload.subject,
          payload.logId,
          'skipped',
        );
        return;
      }
    }

    if (effectiveAttachments && effectiveAttachments.length > 0) {
      console.log(
        `Forwarding ${effectiveAttachments.length} attachment(s) for log ${payload.logId}: ` +
          effectiveAttachments.map((a) => `${a.filename} (${a.contentType})`).join(', '),
      );
    }

    await sendEmail({
      to: payload.userEmail,
      subject: stripCrlf(payload.subject),
      html: forwardedBody,
      replyTo: payload.replyToHeader || payload.sender,
      senderName: resolveSenderDisplayValue(payload.fromHeader || '', payload.sender),
      attachments:
        effectiveAttachments && effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
      headers: {
        'X-Postino-Processed': 'true',
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      },
    });

    await supabase
      .from('email_logs')
      .update({
        processed_at: new Date().toISOString(),
        status: 'forwarded',
        rule_applied: 'AI skipped (credits exhausted)',
        tokens_used: 0,
        estimated_cost: 0,
        estimated_credits: 0,
        processed_body: forwardedBody,
        error_message:
          'AI skipped because monthly credits are exhausted; forwarded original email without AI changes',
      })
      .eq('id', payload.logId);

    await sendEmailPushNotification(
      payload.userId,
      payload.fromHeader || payload.sender,
      payload.subject,
      payload.logId,
      'forwarded',
    );
    return;
  }

  // Fetch rules sorted by sort_order ASC (user-defined), then created_at ASC as tiebreaker.
  const { data: rulesData } = await supabase
    .from('rules')
    .select('id, name, text, match_sender, match_subject, match_body')
    .eq('user_id', payload.userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const allRules = (rulesData ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) || (row.id as string),
    text: row.text as string,
    matchSender: (row.match_sender as string) || '',
    matchSubject: (row.match_subject as string) || '',
    matchBody: (row.match_body as string) || '',
  }));

  // Filter rules based on pattern matching against the incoming email
  const matchingRules: RuleForProcessing[] = allRules.filter(
    (r) =>
      matchesPattern(payload.sender, r.matchSender) &&
      matchesPattern(payload.subject, r.matchSubject) &&
      matchesPattern(payload.emailBody, r.matchBody),
  );

  // Collect attachment names for the LLM prompt and the notification box.
  // Exclude inline attachments (embedded images referenced via cid: in HTML body).
  const attachmentNames =
    effectiveAttachments && effectiveAttachments.length > 0
      ? effectiveAttachments
          .filter((att) => !att.contentId)
          .map((att) => att.filename)
          .filter((name): name is string => Boolean(name))
      : undefined;

  const opencodeMinLen =
    typeof settings?.opencodeMinBodyLength === 'number'
      ? (settings.opencodeMinBodyLength as number)
      : 50000;
  const useSandbox =
    settings?.agentUseOpencode === true && payload.emailBody.length >= opencodeMinLen;
  const agentFn = useSandbox ? processEmailWithSandbox : processEmailWithAgent;

  const result = await agentFn(
    payload.userId,
    payload.logId,
    payload.sender,
    payload.subject,
    payload.emailBody,
    matchingRules,
    payload.bodyHtml !== '',
    undefined,
    attachmentNames?.length ? attachmentNames : undefined,
    analysisOutputLanguage,
    effectiveAttachments?.length ? effectiveAttachments : undefined,
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
              `<a href="${escapeHtml(`${appUrl}/dashboard?editRule=${rule.id}`)}" style="font-weight: bold; text-decoration: underline;">${escapeHtml(rule.name)}</a>`,
          )
          .join(', ')
      : `<strong>${escapeHtml(result.ruleApplied)}</strong>`;

  const notificationBox = isForwardingHeaderEnabled
    ? `<div style="clear: both; margin-top: 24px; font-family: Arial, sans-serif; font-size: 13px; color: #4b5563; line-height: 1.4;">
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
          ${payload.ccAddress ? `<div style="margin-bottom: 6px; color: #4b5563; font-size: 13px;">Cc: ${escapeHtml(payload.ccAddress)}</div>` : ''}
          ${payload.bccAddress ? `<div style="margin-bottom: 6px; color: #4b5563; font-size: 13px;">Bcc: ${escapeHtml(payload.bccAddress)}</div>` : ''}
          <div style="color: #4b5563; font-size: 13px;">Rule: ${ruleDisplayHtml}</div>
        </div>
      </div>`
    : '';

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
    ? result.body.slice(0, lastBodyClose.index) +
      notificationBox +
      result.body.slice(lastBodyClose.index)
    : result.body + notificationBox;

  // Last-mile dedupe guard: when duplicate webhook deliveries slip through with
  // different nonces, ensure only one forwarded email is actually sent for a
  // given user + Message-Id pair.
  if (payload.messageId) {
    const forwardNonce = `forward:${crypto
      .createHash('sha256')
      .update(`${payload.userId}:${payload.messageId}`)
      .digest('hex')}`;

    const { error: nonceErr } = await supabase.from('mailgun_webhook_nonces').insert({
      id: forwardNonce,
      created_at: new Date().toISOString(),
    });

    if (nonceErr) {
      console.warn('[processing] duplicate forward prevented', {
        logId: payload.logId,
        userId: payload.userId,
        messageId: payload.messageId,
      });

      await supabase
        .from('email_logs')
        .update({
          processed_at: new Date().toISOString(),
          status: 'skipped',
          rule_applied: result.ruleApplied,
          tokens_used: result.tokensUsed,
          estimated_cost: result.estimatedCost,
          estimated_credits: dollarsToCredits(
            result.estimatedCost,
            creditSettings.creditsPerDollarFactor,
          ),
          processed_body: result.body,
          error_message: `Duplicate forward prevented for Message-Id: ${payload.messageId}`,
          ...(result.trace
            ? { agent_trace: result.trace as unknown as import('@/types/supabase').Json }
            : {}),
          ...(result.analysis
            ? { email_analysis: result.analysis as unknown as import('@/types/supabase').Json }
            : {}),
        })
        .eq('id', payload.logId);

      await sendEmailPushNotification(
        payload.userId,
        payload.fromHeader || payload.sender,
        result.subject,
        payload.logId,
        'skipped',
      );
      return;
    }
  }

  if (effectiveAttachments && effectiveAttachments.length > 0) {
    console.log(
      `Forwarding ${effectiveAttachments.length} attachment(s) for log ${payload.logId}: ` +
        effectiveAttachments.map((a) => `${a.filename} (${a.contentType})`).join(', '),
    );
  }

  console.log('[processing] sendEmail', {
    logId: payload.logId,
    to: payload.userEmail,
    effectiveAttachmentCount: effectiveAttachments?.length ?? 0,
    effectiveAttachmentNames: effectiveAttachments?.map((a) => a.filename) ?? [],
  });
  await sendEmail({
    to: payload.userEmail,
    subject: stripCrlf(result.subject),
    html: emailHtml,
    replyTo: payload.replyToHeader || payload.sender,
    senderName: resolveSenderDisplayValue(payload.fromHeader || '', payload.sender),
    attachments:
      effectiveAttachments && effectiveAttachments.length > 0 ? effectiveAttachments : undefined,
    headers: {
      'X-Postino-Processed': 'true',
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  });

  const finalStatus: 'forwarded' | 'error' = result.parseError?.includes('forwarded as-is')
    ? 'error'
    : 'forwarded';

  await supabase
    .from('email_logs')
    .update({
      processed_at: new Date().toISOString(),
      status: finalStatus,
      rule_applied: result.ruleApplied,
      tokens_used: result.tokensUsed,
      estimated_cost: result.estimatedCost,
      estimated_credits: dollarsToCredits(
        result.estimatedCost,
        creditSettings.creditsPerDollarFactor,
      ),
      processed_body: result.body,
      ...(result.trace
        ? { agent_trace: result.trace as unknown as import('@/types/supabase').Json }
        : {}),
      ...(result.analysis
        ? { email_analysis: result.analysis as unknown as import('@/types/supabase').Json }
        : {}),
      ...(result.parseError ? { error_message: result.parseError } : {}),
    })
    .eq('id', payload.logId);

  await addUserCreditsUsage({
    userId: payload.userId,
    userEmail: payload.userEmail,
    estimatedCostUsd: result.estimatedCost,
    settingsData: settings,
  });

  // Fire-and-forget push notification — runs after the log update
  // so that a notification failure never blocks or rolls back the email-processing result.
  await sendEmailPushNotification(
    payload.userId,
    payload.fromHeader || payload.sender,
    result.subject,
    payload.logId,
    finalStatus,
  );
}

export async function sendEmailCompletionPushNotification(
  userId: string,
  sender: string,
  subject: string,
  logId: string,
  status: 'forwarded' | 'error' | 'skipped',
): Promise<void> {
  await sendEmailPushNotification(userId, sender, subject, logId, status);
}
