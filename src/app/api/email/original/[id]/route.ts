import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import type { SerializedAttachment } from '@/lib/inbound-processing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUserRequest(request);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;
    const canDownloadAttachments = data.userId === decoded.uid;
    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as SerializedAttachment[])
      : [];

    // Check ownership: must be the owner or an admin
    if (data.userId !== decoded.uid) {
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({
      id: logSnap.id,
      fromAddress: data.fromAddress,
      toAddress: data.toAddress,
      ccAddress: data.ccAddress ?? null,
      bccAddress: data.bccAddress ?? null,
      subject: data.subject,
      originalBody: data.originalBody ?? null,
      receivedAt: data.receivedAt?.toDate?.()?.toISOString() ?? null,
      attachmentCount: data.attachmentCount ?? 0,
      attachmentNames: data.attachmentNames ?? [],
      attachments: attachments.map((attachment, index) => ({
        id: String(index + 1),
        filename: attachment.filename,
        contentType: attachment.contentType,
        canDownload:
          canDownloadAttachments && Boolean(attachment.storagePath || attachment.contentBase64),
      })),
      emailAnalysis: data.emailAnalysis ?? null,
    });
  } catch (error) {
    return handleUserError(error, 'email/original/[id] GET');
  }
}
