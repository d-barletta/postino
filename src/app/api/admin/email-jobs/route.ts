import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { processEmailJobsBatch } from '@/lib/email-jobs';
import { verifyAdminRequest } from '@/lib/api-auth';

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
  details: unknown;
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
    const db = adminDb();

    const countSnaps = await Promise.all(
      STATUSES.map((status) =>
        db.collection('emailJobs').where('status', '==', status).count().get(),
      ),
    );

    const counts = emptyCounts();
    STATUSES.forEach((status, idx) => {
      counts[status] = countSnaps[idx].data().count;
    });

    const recentFailuresSnap = await db
      .collection('emailJobs')
      .where('status', '==', 'failed')
      .orderBy('updatedAt', 'desc')
      .limit(10)
      .get();

    const recentFailures = recentFailuresSnap.docs.map((doc) => {
      const data = doc.data() as {
        lastError?: string;
        attempts?: number;
        payload?: { subject?: string; sender?: string; userEmail?: string; logId?: string };
        updatedAt?: { toDate?: () => Date };
      };
      return {
        id: doc.id,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        attempts: typeof data.attempts === 'number' ? data.attempts : 0,
        error: data.lastError || 'Unknown error',
        subject: data.payload?.subject || 'No subject',
        sender: data.payload?.sender || 'Unknown sender',
        userEmail: data.payload?.userEmail || null,
        logId: data.payload?.logId || null,
      };
    });

    const recentUpdatedSnap = await db
      .collection('emailJobs')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    const settingsSnap = await db.collection('settings').doc('global').get();
    const webhookLoggingEnabled = Boolean(settingsSnap.data()?.mailgunWebhookLoggingEnabled);

    const recentWebhookLogsSnap = await db
      .collection('mailgunWebhookLogs')
      .orderBy('receivedAt', 'desc')
      .limit(MAX_WEBHOOK_LOGS_DISPLAY)
      .get();

    const recentWebhookRequests: MailgunWebhookLogSummary[] = recentWebhookLogsSnap.docs.map(
      (doc) => {
        const data = doc.data() as {
          receivedAt?: { toDate?: () => Date };
          updatedAt?: { toDate?: () => Date };
          status?: string;
          result?: string;
          reason?: string;
          parsed?: {
            sender?: string;
            recipient?: string;
            subject?: string;
            messageId?: string;
            attachmentCount?: number;
          };
          request?: {
            ip?: string;
            userAgent?: string;
            method?: string;
            url?: string;
            host?: string;
            contentType?: string;
            headers?: Record<string, string>;
            payloadStoragePath?: string | null;
          };
          linked?: {
            emailLogId?: string;
            jobId?: string;
          };
          details?: unknown;
        };

        return {
          id: doc.id,
          receivedAt: data.receivedAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
          status: data.status || 'received',
          result: data.result || 'pending',
          reason: data.reason || null,
          sender: data.parsed?.sender || 'Unknown sender',
          recipient: data.parsed?.recipient || 'Unknown recipient',
          subject: data.parsed?.subject || '(no subject)',
          messageId: data.parsed?.messageId || '',
          attachmentCount:
            typeof data.parsed?.attachmentCount === 'number' ? data.parsed.attachmentCount : 0,
          ip: data.request?.ip || '—',
          userAgent: data.request?.userAgent || '—',
          emailLogId: data.linked?.emailLogId || null,
          jobId: data.linked?.jobId || null,
          details: {
            request: data.request ?? null,
            parsed: data.parsed ?? null,
            linked: data.linked ?? null,
            details: data.details ?? null,
          },
        };
      },
    );

    const latestUpdatedAt = recentUpdatedSnap.empty
      ? null
      : (recentUpdatedSnap.docs[0].data().updatedAt?.toDate?.()?.toISOString() ?? null);

    return NextResponse.json({
      counts,
      backlog: counts.pending + counts.retrying,
      latestUpdatedAt,
      recentFailures,
      webhookLoggingEnabled,
      recentWebhookRequests,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    if (statusCode === 500) console.error('[admin/email-jobs] GET error:', error);
    return NextResponse.json({ error: msg }, { status: statusCode });
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

    const db = adminDb();
    await db.collection('settings').doc('global').set(
      {
        mailgunWebhookLoggingEnabled: body.webhookLoggingEnabled,
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, webhookLoggingEnabled: body.webhookLoggingEnabled });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    if (statusCode === 500) console.error('[admin/email-jobs] PUT error:', error);
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdminRequest(request);

    const body = (await request.json().catch(() => ({}))) as { batchSize?: number };
    const rawBatchSize = typeof body.batchSize === 'number' ? Math.floor(body.batchSize) : 10;
    const batchSize = Math.min(Math.max(rawBatchSize, 1), 50);

    const result = await processEmailJobsBatch(batchSize);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    if (statusCode === 500) console.error('[admin/email-jobs] POST error:', error);
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await verifyAdminRequest(request);

    const db = adminDb();
    const query = db.collection('mailgunWebhookLogs').orderBy('receivedAt', 'desc');
    let deletedCount = 0;

    // Delete in chunks to stay within Firestore batch operation limits.
    while (true) {
      const snap = await query.limit(500).get();
      if (snap.empty) break;

      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deletedCount += snap.size;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    if (statusCode === 500) console.error('[admin/email-jobs] DELETE error:', error);
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}
