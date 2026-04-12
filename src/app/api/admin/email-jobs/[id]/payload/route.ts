import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch only the raw_fields to get the storage path
    const { data: row, error: dbError } = await supabase
      .from('mailgun_webhook_logs')
      .select('raw_fields')
      .eq('id', id)
      .single();

    if (dbError || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const raw = (row.raw_fields ?? {}) as { payloadStoragePath?: string | null };
    const storagePath = raw.payloadStoragePath;

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ error: 'No payload file stored for this log' }, { status: 404 });
    }

    const { data: blob, error: storageError } = await supabase.storage
      .from('email-attachments')
      .download(storagePath);

    if (storageError || !blob) {
      return NextResponse.json({ error: 'Failed to load payload file' }, { status: 502 });
    }

    const text = await blob.text();

    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs/[id]/payload GET');
  }
}
