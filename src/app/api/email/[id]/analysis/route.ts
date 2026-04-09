import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeStoredEmailLog } from '@/lib/email-analysis';
import { saveToSupermemory, buildMemoryEntryFromAnalysis } from '@/agents/email-agent';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const decoded = await verifyUserRequest(request);
    const { id } = await params;
    const db = adminDb();
    const logRef = db.collection('emailLogs').doc(id);
    const logSnap = await logRef.get();

    if (!logSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = logSnap.data()!;

    if (data.userId !== decoded.uid) {
      const requesterSnap = await db.collection('users').doc(decoded.uid).get();
      if (!requesterSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (typeof data.originalBody !== 'string' || !data.originalBody.trim()) {
      return NextResponse.json({ error: 'Original email content unavailable' }, { status: 400 });
    }

    const ownerId = typeof data.userId === 'string' ? data.userId : '';
    const ownerSnap = ownerId ? await db.collection('users').doc(ownerId).get() : null;
    const analysisOutputLanguage =
      typeof ownerSnap?.data()?.analysisOutputLanguage === 'string'
        ? (ownerSnap.data()?.analysisOutputLanguage as string) || undefined
        : undefined;

    let safeAnalysis;
    try {
      safeAnalysis = await analyzeStoredEmailLog({
        fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
        subject: typeof data.subject === 'string' ? data.subject : '',
        originalBody: data.originalBody,
        analysisOutputLanguage,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Analysis unavailable') {
        return NextResponse.json({ error: 'Analysis unavailable' }, { status: 502 });
      }
      throw error;
    }

    await logRef.update({ emailAnalysis: safeAnalysis });

    // Optionally persist the updated analysis to Supermemory (fire-and-forget)
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settingsData = settingsSnap.data();
    if (settingsData?.memoryEnabled === true) {
      const supermemoryApiKey = (
        (settingsData?.memoryApiKey as string | undefined) ||
        process.env.SUPERMEMORY_API_KEY ||
        ''
      ).trim();
      if (supermemoryApiKey) {
        const receivedAt =
          data.receivedAt instanceof Timestamp ? data.receivedAt.toDate() : new Date();
        const entry = buildMemoryEntryFromAnalysis(
          {
            logId: id,
            date: receivedAt.toISOString().slice(0, 10),
            timestamp: receivedAt.toISOString(),
            fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
            subject: typeof data.subject === 'string' ? data.subject : '',
            ruleApplied: typeof data.ruleApplied === 'string' ? data.ruleApplied : undefined,
            wasSummarized: typeof data.ruleApplied === 'string' && data.ruleApplied.length > 0,
          },
          safeAnalysis,
        );
        saveToSupermemory(supermemoryApiKey, ownerId, entry).catch((err) =>
          console.error(`[email/${id}/analysis] failed to save to Supermemory:`, err),
        );
      }
    }

    return NextResponse.json({ analysis: safeAnalysis });
  } catch (error) {
    return handleUserError(error, 'email/[id]/analysis');
  }
}
