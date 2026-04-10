import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
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
    const decoded = await verifyUserRequest(request);
    const { id, attachmentId } = await params;
    const attachmentIndex = Number.parseInt(attachmentId, 10);

    if (!Number.isFinite(attachmentIndex) || attachmentIndex <= 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;
    if (data.userId !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as SerializedAttachment[])
      : [];
    const attachment = attachments[attachmentIndex - 1];

    if (!attachment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let content: Buffer;
    if (attachment.storagePath) {
      try {
        const [downloaded] = await adminStorage().bucket().file(attachment.storagePath).download();
        content = Buffer.from(downloaded);
      } catch (error) {
        console.error('Failed to download stored attachment for user request', {
          emailId: id,
          attachmentId,
          storagePath: attachment.storagePath,
          userId: decoded.uid,
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
          userId: decoded.uid,
          error,
        });
        return NextResponse.json({ error: 'Failed to download attachment' }, { status: 500 });
      }
    } else {
      console.error('Attachment record is missing both storagePath and contentBase64', {
        emailId: id,
        attachmentId,
        userId: decoded.uid,
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
