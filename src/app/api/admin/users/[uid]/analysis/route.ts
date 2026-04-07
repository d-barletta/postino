import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeStoredEmailLog } from '@/lib/email-analysis';

const BATCH_SIZE = 400;
const MAX_PROCESS_BATCH = 5;

export const maxDuration = 60;

async function clearEmailAnalyses(
  refs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[],
): Promise<void> {
  const db = adminDb();

  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = refs.slice(i, i + BATCH_SIZE);
    chunk.forEach((ref) => {
      batch.update(ref, { emailAnalysis: FieldValue.delete() });
    });
    await batch.commit();
  }
}

async function invalidateDerivedUserData(uid: string): Promise<void> {
  const db = adminDb();
  const suggestionsSnap = await db
    .collection('entityMergeSuggestions')
    .where('userId', '==', uid)
    .get();

  const refs = [
    db.collection('entityRelations').doc(uid),
    db.collection('entityFlows').doc(uid),
    db.collection('entityPlaceMaps').doc(uid),
    ...suggestionsSnap.docs.map((doc) => doc.ref),
  ];

  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const db = adminDb();

    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: 'prepare' | 'process';
      emailIds?: string[];
    };

    const action = body.action ?? 'prepare';

    if (action === 'prepare') {
      // Fetch all email log IDs, clear existing analyses, and return IDs for batch processing.
      const logsSnap = await db
        .collection('emailLogs')
        .where('userId', '==', uid)
        .orderBy('receivedAt', 'desc')
        .get();

      const logDocs = logsSnap.docs;
      await clearEmailAnalyses(logDocs.map((doc) => doc.ref));
      await invalidateDerivedUserData(uid);

      return NextResponse.json({
        totalCount: logDocs.length,
        emailIds: logDocs.map((doc) => doc.id),
      });
    }

    if (action === 'process') {
      const analysisOutputLanguage =
        typeof userSnap.data()?.analysisOutputLanguage === 'string'
          ? (userSnap.data()?.analysisOutputLanguage as string) || undefined
          : undefined;

      if (!Array.isArray(body.emailIds)) {
        return NextResponse.json({ error: 'emailIds must be an array' }, { status: 400 });
      }

      const emailIds = body.emailIds.slice(0, MAX_PROCESS_BATCH);

      let reanalyzedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const emailId of emailIds) {
        const logDoc = await db.collection('emailLogs').doc(emailId).get();

        if (!logDoc.exists) {
          skippedCount += 1;
          continue;
        }

        const data = logDoc.data()!;
        const originalBody = typeof data.originalBody === 'string' ? data.originalBody : '';

        if (!originalBody.trim()) {
          skippedCount += 1;
          continue;
        }

        try {
          const safeAnalysis = await analyzeStoredEmailLog({
            fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
            subject: typeof data.subject === 'string' ? data.subject : '',
            originalBody,
            analysisOutputLanguage,
          });

          await logDoc.ref.update({ emailAnalysis: safeAnalysis });
          reanalyzedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error(`[admin/users/${uid}/analysis] failed to analyze log ${emailId}:`, error);
        }
      }

      return NextResponse.json({ reanalyzedCount, failedCount, skippedCount });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) {
      console.error('[admin/users/[uid]/analysis] POST error:', error);
    }
    return NextResponse.json({ error: msg }, { status });
  }
}
