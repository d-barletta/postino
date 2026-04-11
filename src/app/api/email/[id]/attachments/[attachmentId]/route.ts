import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import type { SerializedAttachment } from '@/lib/inbound-processing';

function buildAttachmentDisposition(filename: string): string {
  const fallback = filename.replace(/["\r\n]/g, '_') || 'attachment';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename || 'attachment')}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const user = await verifyUserRequest(request);
    const { id, attachmentId } = await params;
    const attachmentIndex = Number.parseInt(attachmentId, 10);

    if (!Number.isFinite(attachmentIndex) || attachmentIndex <= 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const supabase = createAdminClient();

    const { data: logRow } = await supabase
      .from('email_logs')
      .select('user_id, attachments')
      .eq('id', id)
      .single();

    if (!logRow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (logRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachments = Array.isArray(logRow.attachments)
      ? (logRow.attachments as unknown as SerializedAttachment[])
      : [];
    const attachment = attachments[attachmentIndex - 1];

    if (!attachment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let content: Buffer;
    if (attachment.storagePath) {
      try {
        const { data: downloaded, error: storageError } = await supabase.storage
          .from('email-attachments')
          .download(attachment.storagePath);
        if (storageError || !downloaded) throw storageError ?? new Error('Download failed');
        content = Buffer.from(await downloaded.arrayBuffer());
      } catch (error) {
        console.error('Failed to download stored attachment for user request', {
          emailId: id,
          attachmentId,
          storagePath: attachment.storagePath,
          userId: user.id,
          error,
        });
        return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
      }
    } else if (attachment.contentBase64) {
      try {
        content = Buffer.from(attachment.contentBase64, 'base64');
      } catch (error) {
        console.error('Failed to decode legacy attachment payload for user download', {
          emailId: id,
          attachmentId,
          userId: user.id,
          error,
        });
        return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
      }
    } else {
      console.error('Attachment record is missing both storagePath and contentBase64', {
        emailId: id,
        attachmentId,
        userId: user.id,
        filename: attachment.filename,
      });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const responseBody = new Uint8Array(content.byteLength);
    responseBody.set(content);

    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': attachment.contentType || 'application/octet-stream',
        'Content-Disposition': buildAttachmentDisposition(attachment.filename || 'attachment'),
        'Cache-Control': 'private, no-store',
        'Content-Length': String(content.byteLength),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleUserError(error, 'email/[id]/attachments/[attachmentId] GET');
  }
}
