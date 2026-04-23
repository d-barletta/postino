import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { enqueueEmailJob, triggerEmailJobsProcessing } from '@/lib/email-jobs';
import { getBaseUrl } from '@/lib/request-utils';
import { type SerializedAttachment, type QueuedInboundPayload } from '@/lib/inbound-processing';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch the email log — need all fields required to rebuild QueuedInboundPayload
    const { data: logRow, error: logError } = await supabase
      .from('email_logs')
      .select(
        'id, user_id, from_address, to_address, cc_address, bcc_address, subject, original_body, message_id, attachments, status, rule_applied, error_message',
      )
      .eq('id', id)
      .single();

    if (!logRow || logError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only the owner can retry their own email
    if (logRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Allow retrying emails that failed (error) or were skipped for any reason
    if (logRow.status !== 'error' && logRow.status !== 'skipped') {
      return NextResponse.json(
        { error: 'Email is not in a failed or skipped state' },
        { status: 422 },
      );
    }

    // Fetch the owner's email address (needed for QueuedInboundPayload.userEmail)
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', user.id)
      .single();

    if (!userRow?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 500 });
    }

    const originalBody = (logRow.original_body as string) ?? '';
    const isHtml = /<[a-z][\s\S]*>/i.test(originalBody);

    const attachments = Array.isArray(logRow.attachments)
      ? (logRow.attachments as unknown as SerializedAttachment[])
      : [];

    // Reset the log back to a fresh pending state before reprocessing
    await supabase
      .from('email_logs')
      .update({
        status: 'pending',
        processed_at: null,
        processing_started_at: null,
        error_message: null,
        rule_applied: null,
        processed_body: null,
        tokens_used: null,
        estimated_cost: null,
        estimated_credits: null,
        email_analysis: null,
        agent_trace: null,
      })
      .eq('id', id);

    const payload: QueuedInboundPayload = {
      logId: id,
      userId: user.id,
      userEmail: userRow.email,
      matchedRecipient: (logRow.to_address as string) ?? '',
      sender: (logRow.from_address as string) ?? '',
      fromHeader: (logRow.from_address as string) ?? '',
      replyToHeader: '',
      subject: (logRow.subject as string) ?? '',
      emailBody: originalBody,
      bodyHtml: isHtml ? originalBody : '',
      bodyPlain: isHtml ? '' : originalBody,
      messageId: (logRow.message_id as string) ?? '',
      ccAddress: (logRow.cc_address as string) ?? undefined,
      bccAddress: (logRow.bcc_address as string) ?? undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    // Enqueue a new job and trigger processing asynchronously (same pattern as the
    // inbound route). Calling processQueuedInboundPayload directly would time out
    // the Vercel function and leave the email stuck in the pending state forever.
    const jobId = crypto.randomUUID();
    await enqueueEmailJob(payload, jobId);

    after(async () => {
      try {
        await triggerEmailJobsProcessing(getBaseUrl(request), 1);
      } catch (err) {
        console.error(`[reprocess] Async process trigger failed (jobId: ${jobId}):`, err);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleUserError(error, 'email/[id]/reprocess POST');
  }
}
