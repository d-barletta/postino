import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

/**
 * PATCH /api/admin/email-jobs/[id]
 * Re-queues a permanently failed email job by resetting it back to pending.
 * Only jobs in 'failed' status can be retried.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminRequest(request);

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // Only allow retrying jobs that are in 'failed' status to prevent
    // accidentally re-queuing jobs that are already being processed.
    const { data: updated, error } = await supabase
      .from('email_jobs')
      .update({
        status: 'pending',
        attempts: 0,
        last_error: null,
        lock_until: null,
        locked_by: null,
        not_before: null,
        completed_at: null,
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle();

    if (error) throw error;

    if (!updated) {
      return NextResponse.json(
        { error: 'Job not found or is not in failed status' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs/[id] PATCH');
  }
}
