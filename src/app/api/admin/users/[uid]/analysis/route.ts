import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAdminRequest } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeStoredEmailLog } from '@/lib/email-analysis';
import { saveToSupermemory } from '@/agents/email-agent';
import type { EmailAnalysis, EmailMemoryEntry } from '@/types';

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

function buildMemoryEntry(
  emailId: string,
  data: FirebaseFirestore.DocumentData,
  analysis: EmailAnalysis,
): EmailMemoryEntry {
  // Derive a YYYY-MM-DD date string from the Firestore Timestamp (or fall back to today)
  let date = new Date().toISOString().slice(0, 10);
  let timestamp = new Date().toISOString();
  if (data.receivedAt instanceof Timestamp) {
    const d = data.receivedAt.toDate();
    date = d.toISOString().slice(0, 10);
    timestamp = d.toISOString();
  }

  return {
    logId: emailId,
    date,
    timestamp,
    fromAddress: typeof data.fromAddress === 'string' ? data.fromAddress : '',
    subject: typeof data.subject === 'string' ? data.subject : '',
    ruleApplied: typeof data.ruleApplied === 'string' ? data.ruleApplied : undefined,
    // wasSummarized reflects whether the email was forwarded via a rule;
    // derive from the stored ruleApplied field since we don't reprocess here.
    wasSummarized: typeof data.ruleApplied === 'string' && data.ruleApplied.length > 0,
    ...(analysis.summary ? { summary: analysis.summary } : {}),
    ...(analysis.emailType ? { emailType: analysis.emailType } : {}),
    ...(analysis.language ? { language: analysis.language } : {}),
    ...(analysis.sentiment ? { sentiment: analysis.sentiment } : {}),
    ...(analysis.priority ? { priority: analysis.priority } : {}),
    ...(analysis.tags?.length ? { tags: analysis.tags } : {}),
    ...(analysis.intent ? { intent: analysis.intent } : {}),
    ...(analysis.senderType ? { senderType: analysis.senderType } : {}),
    ...(analysis.requiresResponse !== undefined
      ? { requiresResponse: analysis.requiresResponse }
      : {}),
    ...(analysis.entities
      ? {
          entities: {
            places: analysis.entities.placeNames,
            events: analysis.entities.events,
            dates: analysis.entities.dates,
            people: analysis.entities.people,
            organizations: analysis.entities.organizations,
            numbers: analysis.entities.numbers,
          },
        }
      : {}),
  };
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

      // Check if Supermemory is enabled and resolve the API key once per batch
      const settingsSnap = await db.collection('settings').doc('global').get();
      const settingsData = settingsSnap.data();
      const memoryEnabled = settingsData?.memoryEnabled === true;
      const supermemoryApiKey = memoryEnabled
        ? (
            (settingsData?.memoryApiKey as string | undefined) ||
            process.env.SUPERMEMORY_API_KEY ||
            ''
          ).trim()
        : '';

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

          // Optionally persist the updated analysis to Supermemory (fire-and-forget)
          if (memoryEnabled && supermemoryApiKey) {
            const entry = buildMemoryEntry(emailId, data, safeAnalysis);
            saveToSupermemory(supermemoryApiKey, uid, entry).catch((err) =>
              console.error(
                `[admin/users/${uid}/analysis] failed to save log ${emailId} to Supermemory:`,
                err,
              ),
            );
          }
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
