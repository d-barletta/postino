import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import {
  deleteAttachmentFromStorage,
  type SerializedAttachment,
} from '@/lib/inbound-processing';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const decoded = await verifyUserRequest(request);

    const { id } = await params;
    const db = adminDb();
    const logSnap = await db.collection('emailLogs').doc(id).get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;

    // Check ownership: must be the owner or an admin
    if (data.userId !== decoded.uid) {
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as SerializedAttachment[])
      : [];

    await Promise.all(
      attachments
        .filter((attachment) => attachment.storagePath)
        .map((attachment) => deleteAttachmentFromStorage(attachment.storagePath!)),
    );

    await db.collection('emailLogs').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUserError(error, 'email/[id] DELETE');
  }
}
