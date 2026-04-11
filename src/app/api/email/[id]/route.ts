import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { deleteAttachmentFromStorage, type SerializedAttachment } from '@/lib/inbound-processing';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUserRequest(request);

    const { id } = await params;
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('email_logs').select('*').eq('id', id).single();

    if (!data || error) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Check ownership: must be the owner or an admin
    if (data.user_id !== user.id) {
      const { data: userData } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      if (!userData?.is_admin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const attachments = Array.isArray(data.attachments)
      ? (data.attachments as unknown as SerializedAttachment[])
      : [];

    await Promise.all(
      attachments
        .filter((attachment) => attachment.storagePath)
        .map((attachment) => deleteAttachmentFromStorage(attachment.storagePath!)),
    );

    await supabase.from('email_logs').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUserError(error, 'email/[id] DELETE');
  }
}
