import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

const MAX_IDS = 20;

export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyUserRequest(request);

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids)
      ? (body.ids as unknown[])
          .slice(0, MAX_IDS)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    const db = adminDb();
    const snapshots = await Promise.all(ids.map((id) => db.collection('emailLogs').doc(id).get()));

    const logs = snapshots
      .filter((snap) => snap.exists && snap.data()?.userId === uid)
      .map((snap) => {
        const d = snap.data()!;
        return {
          id: snap.id,
          toAddress: (d.toAddress as string) || '',
          fromAddress: (d.fromAddress as string) || '',
          ccAddress: (d.ccAddress as string | undefined) || undefined,
          bccAddress: (d.bccAddress as string | undefined) || undefined,
          subject: (d.subject as string) || '',
          receivedAt: d.receivedAt?.toDate?.()?.toISOString() ?? null,
          processedAt: d.processedAt?.toDate?.()?.toISOString() ?? null,
          status: d.status,
          ruleApplied: d.ruleApplied,
          tokensUsed: d.tokensUsed,
          estimatedCost: d.estimatedCost,
          errorMessage: d.errorMessage,
          attachmentCount: (d.attachmentCount as number) ?? 0,
          attachmentNames: (d.attachmentNames as string[]) ?? [],
          userId: d.userId,
          emailAnalysis: d.emailAnalysis ?? null,
        };
      });

    return NextResponse.json({ logs });
  } catch (error) {
    if (isFirebaseAuthError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching emails by IDs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
