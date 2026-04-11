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
        'user_id, from_address, to_address, cc_address, bcc_address, subject, original_body, received_at, attachment_count, attachment_names, attachments, email_analysis',
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

    return NextResponse.json({
      id,
      fromAddress: logRow.from_address,
      toAddress: logRow.to_address,
      ccAddress: logRow.cc_address ?? null,
      bccAddress: logRow.bcc_address ?? null,
      subject: logRow.subject,
      originalBody: logRow.original_body ?? null,
      receivedAt: logRow.received_at ?? null,
      attachmentCount: logRow.attachment_count ?? 0,
      attachmentNames: logRow.attachment_names ?? [],
      attachments: attachments.map((attachment, index) => ({
        id: String(index + 1),
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
