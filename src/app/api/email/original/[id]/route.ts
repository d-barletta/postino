import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import type { SerializedAttachment } from '@/lib/inbound-processing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUserRequest(request);

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: logRow } = await supabase
      .from('email_logs')
      .select(
        'user_id, from_address, to_address, cc_address, bcc_address, subject, original_body, processed_body, rule_applied, received_at, attachment_count, attachment_names, attachments, email_analysis',
      )
      .eq('id', id)
      .single();

    if (!logRow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const canDownloadAttachments = logRow.user_id === user.id;
    const attachments = Array.isArray(logRow.attachments)
      ? (logRow.attachments as unknown as SerializedAttachment[])
      : [];

    // Check ownership: must be the owner or an admin
    if (logRow.user_id !== user.id) {
      const { data: userRow } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      if (!userRow?.is_admin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Replace cid: references in the HTML body with signed storage URLs so the
    // sandboxed iframe can render inline images (logos, QR codes, etc.).
    // Attachments that have a contentId but no matching cid: reference in the
    // HTML (e.g. Apple Mail inline parts that lost their src after forwarding)
    // are collected as "orphans" and appended at the bottom of the body.
    let resolvedBody = logRow.original_body ?? null;
    const inlineStorageAttachments = attachments.filter((a) => a.contentId && a.storagePath);
    if (resolvedBody && inlineStorageAttachments.length > 0) {
      const signedResults = await Promise.all(
        inlineStorageAttachments.map(async (att) => {
          const { data } = await supabase.storage
            .from('email-attachments')
            .createSignedUrl(att.storagePath!, 3600);
          return { att, signedUrl: data?.signedUrl ?? null };
        }),
      );

      const orphanImgTags: string[] = [];
      for (const { att, signedUrl } of signedResults) {
        if (!signedUrl || !att.contentId) continue;
        const cidRef = `cid:${att.contentId}`;
        if (resolvedBody.includes(cidRef)) {
          resolvedBody = resolvedBody.split(cidRef).join(signedUrl);
        } else if (att.contentType.startsWith('image/')) {
          // Escape the URL for safe insertion as an HTML attribute value.
          const safeUrl = signedUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
          orphanImgTags.push(
            `<img src="${safeUrl}" alt="" style="max-width:100%;height:auto;display:inline-block;" />`,
          );
        }
      }

      if (orphanImgTags.length > 0) {
        resolvedBody +=
          `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:12px;` +
          `border-top:1px solid #e0e0e0;">` +
          orphanImgTags.join('') +
          `</div>`;
      }
    }

    return NextResponse.json({
      id,
      fromAddress: logRow.from_address,
      toAddress: logRow.to_address,
      ccAddress: logRow.cc_address ?? null,
      bccAddress: logRow.bcc_address ?? null,
      subject: logRow.subject,
      originalBody: resolvedBody,
      processedBody: logRow.processed_body ?? null,
      ruleApplied: logRow.rule_applied ?? null,
      receivedAt: logRow.received_at ?? null,
      attachmentCount: logRow.attachment_count ?? 0,
      attachmentNames: logRow.attachment_names ?? [],
      // Exclude inline attachments (embedded images referenced via cid: in HTML body).
      // The download endpoint uses 1-based indices into the full attachments array, so
      // preserve the original index as the id even after filtering.
      attachments: attachments
        .map((attachment, index) => ({ attachment, originalIndex: index }))
        .filter(({ attachment }) => !attachment.contentId)
        .map(({ attachment, originalIndex }) => ({
          id: String(originalIndex + 1),
          filename: attachment.filename,
          contentType: attachment.contentType,
          canDownload:
            canDownloadAttachments && Boolean(attachment.storagePath || attachment.contentBase64),
        })),
      emailAnalysis: logRow.email_analysis ?? null,
    });
  } catch (error) {
    return handleUserError(error, 'email/original/[id] GET');
  }
}
