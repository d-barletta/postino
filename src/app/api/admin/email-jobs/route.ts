import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { processEmailJobsBatch } from '@/lib/email-jobs';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
}

const STATUSES = ['pending', 'processing', 'retrying', 'done', 'failed'] as const;

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
    await verifyAdmin(request);
    const db = adminDb();

    const countSnaps = await Promise.all(
      STATUSES.map((status) =>
        db.collection('emailJobs').where('status', '==', status).count().get()
      )
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

    const latestUpdatedAt = recentUpdatedSnap.empty
      ? null
      : recentUpdatedSnap.docs[0].data().updatedAt?.toDate?.()?.toISOString() ?? null;

    return NextResponse.json({
      counts,
      backlog: counts.pending + counts.retrying,
      latestUpdatedAt,
      recentFailures,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);

    const body = (await request.json().catch(() => ({}))) as { batchSize?: number };
    const rawBatchSize = typeof body.batchSize === 'number' ? Math.floor(body.batchSize) : 10;
    const batchSize = Math.min(Math.max(rawBatchSize, 1), 50);

    const result = await processEmailJobsBatch(batchSize);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const statusCode = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status: statusCode });
  }
}
