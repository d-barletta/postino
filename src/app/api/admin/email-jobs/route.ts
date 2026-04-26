import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';
import { processEmailJobsBatch } from '@/lib/email-jobs';
import { deleteWebhookLogStorageFiles } from '@/lib/inbound-processing';

const STATUSES = ['pending', 'processing', 'retrying', 'done', 'failed'] as const;

const MAX_WEBHOOK_LOGS_DISPLAY = 200;

interface MailgunWebhookLogSummary {
  id: string;
  receivedAt: string | null;
  updatedAt: string | null;
  status: string;
  result: string;
  reason: string | null;
  sender: string;
  recipient: string;
  subject: string;
  messageId: string;
  attachmentCount: number;
  ip: string;
  userAgent: string;
  emailLogId: string | null;
  jobId: string | null;
  payloadStoragePath: string | null;
}

interface JobCounts {
  pending: number;
  processing: number;
  retrying: number;
  done: number;
  failed: number;
}

function emptyCounts(): JobCounts {
  return {
    pending: 0,
    processing: 0,
    retrying: 0,
    done: 0,
    failed: 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();

    // Count per status in parallel
    const countResults = await Promise.all(
      STATUSES.map((status) =>
        supabase
          .from('email_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', status),
      ),
    );

    const counts = emptyCounts();
    STATUSES.forEach((status, idx) => {
      counts[status] = countResults[idx].count ?? 0;
    });

    const { data: failureRows } = await supabase
      .from('email_jobs')
      .select('id, last_error, payload, created_at')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10);

    const recentFailures = (failureRows ?? []).map((row) => {
      const payload = (row.payload ?? {}) as {
        subject?: string;
        sender?: string;
        userEmail?: string;
        logId?: string;
      };
      return {
        id: row.id as string,
        updatedAt: (row.created_at as string) ?? null,
        attempts: 0,
        error: (row.last_error as string) || 'Unknown error',
        subject: payload.subject || 'No subject',
        sender: payload.sender || 'Unknown sender',
        userEmail: payload.userEmail || null,
        logId: payload.logId || null,
      };
    });

    const { data: latestJobRows } = await supabase
      .from('email_jobs')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settingsData = (settingsRow?.data ?? {}) as Record<string, unknown>;
    const webhookLoggingEnabled = Boolean(settingsData.mailgunWebhookLoggingEnabled);
    // agentTracingEnabled defaults to true when not explicitly set (mirrors agent behavior).
    const agentTracingEnabled = settingsData.agentTracingEnabled !== false;

    const { data: webhookRows } = await supabase
      .from('mailgun_webhook_logs')
      .select(
        'id, received_at, updated_at, status, result, reason, preview_fields, raw_fields, linked',
      )
      .order('received_at', { ascending: false })
      .limit(MAX_WEBHOOK_LOGS_DISPLAY);

    const recentWebhookRequests: MailgunWebhookLogSummary[] = (webhookRows ?? []).map((row) => {
      const preview = (row.preview_fields ?? {}) as {
        sender?: string;
        recipient?: string;
        subject?: string;
        messageId?: string;
        attachmentCount?: number;
      };
      const raw = (row.raw_fields ?? {}) as {
        ip?: string;
        userAgent?: string;
        method?: string;
        url?: string;
        host?: string;
        contentType?: string;
        headers?: Record<string, string>;
        payloadStoragePath?: string | null;
      };
      const linked = (row.linked ?? {}) as { emailLogId?: string; jobId?: string };

      return {
        id: row.id as string,
        receivedAt: (row.received_at as string) ?? null,
        updatedAt: (row.updated_at as string) ?? null,
        status: (row.status as string) || 'received',
        result: (row.result as string) || 'pending',
        reason: (row.reason as string) || null,
        sender: preview.sender || 'Unknown sender',
        recipient: preview.recipient || 'Unknown recipient',
        subject: preview.subject || '(no subject)',
        messageId: preview.messageId || '',
        attachmentCount: typeof preview.attachmentCount === 'number' ? preview.attachmentCount : 0,
        ip: raw.ip || '\u2014',
        userAgent: raw.userAgent || '\u2014',
        emailLogId: linked.emailLogId || null,
        jobId: linked.jobId || null,
        payloadStoragePath: raw.payloadStoragePath ?? null,
      };
    });

    // Fetch recent email logs that have an OpenCode run log stored in Supabase Storage.
    const { data: runLogRows } = await supabase
      .from('email_logs')
      .select('id, from_address, subject, received_at, processed_at, status, agent_trace')
      .not('agent_trace', 'is', null)
      .order('received_at', { ascending: false })
      .limit(200);

    const recentAgentRunLogs = (runLogRows ?? [])
      .filter((row) => {
        const trace = row.agent_trace as { runLogStoragePath?: string } | null;
        return Boolean(trace?.runLogStoragePath);
      })
      .slice(0, 50)
      .map((row) => {
        const trace = row.agent_trace as { runLogStoragePath?: string } | null;
        return {
          id: row.id as string,
          fromAddress: (row.from_address as string) ?? 'Unknown sender',
          subject: (row.subject as string) ?? '(no subject)',
          receivedAt: (row.received_at as string) ?? null,
          processedAt: (row.processed_at as string) ?? null,
          status: (row.status as string) ?? 'unknown',
          runLogStoragePath: trace?.runLogStoragePath ?? null,
        };
      });

    const latestUpdatedAt =
      latestJobRows && latestJobRows.length > 0
        ? ((latestJobRows[0].created_at as string) ?? null)
        : null;

    return NextResponse.json(
      {
        counts,
        backlog: counts.pending + counts.retrying,
        latestUpdatedAt,
        recentFailures,
        webhookLoggingEnabled,
        recentWebhookRequests,
        agentTracingEnabled,
        recentAgentRunLogs,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdminRequest(request);

    const body = (await request.json().catch(() => ({}))) as { batchSize?: number };
    const batchSize =
      typeof body.batchSize === 'number'
        ? Math.min(Math.max(Math.floor(body.batchSize), 1), 50)
        : 10;

    const result = await processEmailJobsBatch(batchSize);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs POST');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await verifyAdminRequest(request);
    const supabase = createAdminClient();

    // Collect webhook log IDs so we can delete their storage snapshots first.
    const { data: webhookLogRows } = await supabase.from('mailgun_webhook_logs').select('id');
    const webhookLogIds = (webhookLogRows ?? []).map((r) => r.id as string);
    await deleteWebhookLogStorageFiles(webhookLogIds);

    const [logsResult, jobsResult] = await Promise.all([
      supabase.from('mailgun_webhook_logs').delete().not('id', 'is', null),
      supabase.from('email_jobs').delete().not('id', 'is', null),
    ]);
    if (logsResult.error) throw logsResult.error;
    if (jobsResult.error) throw jobsResult.error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs DELETE');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await verifyAdminRequest(request);

    const body = (await request.json().catch(() => ({}))) as {
      webhookLoggingEnabled?: boolean;
    };

    if (typeof body.webhookLoggingEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid payload: webhookLoggingEnabled must be a boolean' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const existingData = (settingsRow?.data ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    await supabase.from('settings').upsert({
      id: 'global',
      data: { ...existingData, mailgunWebhookLoggingEnabled: body.webhookLoggingEnabled },
      updated_at: now,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error, 'admin/email-jobs PUT');
  }
}
