import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import type { AgentTrace } from '@/lib/openrouter';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: dbError } = await supabase
      .from('email_logs')
      .select('agent_trace')
      .eq('id', id)
      .single();

    if (dbError || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const trace = row.agent_trace as AgentTrace | null;
    const storagePath = trace?.runLogStoragePath;

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ error: 'No run log stored for this email' }, { status: 404 });
    }

    const { data: blob, error: storageError } = await supabase.storage
      .from('email-attachments')
      .download(storagePath);

    if (storageError || !blob) {
      return NextResponse.json({ error: 'Failed to load run log file' }, { status: 502 });
    }

    const text = await blob.text();

    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    return handleAdminError(error, 'admin/email-logs/[id]/run-log GET');
  }
}
