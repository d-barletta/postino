import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// DELETE – remove all AI analysis data for the authenticated user's emails:
//   • emailLogs[].emailAnalysis    – structured AI analysis
//   • emailLogs[].tokensUsed       – AI token usage
//   • emailLogs[].estimatedCost    – AI cost estimate
//   • emailLogs[].processedBody    – AI-generated processed content
//   • entityMerges                 – user-defined entity merge rules
//   • entityMergeSuggestions       – AI merge suggestions
//   • entityRelations/{uid}        – cached relation graph
//   • entityFlows/{uid}            – cached flow graph
//   • entityPlaceMaps/{uid}        – cached place map
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const uid = decoded.uid;

    const [logsSnap, mergesSnap, suggestionsSnap] = await Promise.all([
      db.collection('emailLogs').where('userId', '==', uid).get(),
      db.collection('entityMerges').where('userId', '==', uid).get(),
      db.collection('entityMergeSuggestions').where('userId', '==', uid).get(),
    ]);

    // Clear AI fields from all email logs
    for (let i = 0; i < logsSnap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = logsSnap.docs.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        batch.update(doc.ref, {
          emailAnalysis: FieldValue.delete(),
          tokensUsed: FieldValue.delete(),
          estimatedCost: FieldValue.delete(),
          processedBody: FieldValue.delete(),
        });
      }
      await batch.commit();
    }

    // Delete entity merges and suggestions (derived from analysis)
    const deleteRefs = [
      ...mergesSnap.docs.map((d) => d.ref),
      ...suggestionsSnap.docs.map((d) => d.ref),
    ];

    for (let i = 0; i < deleteRefs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (let j = i; j < Math.min(i + BATCH_SIZE, deleteRefs.length); j++) {
        batch.delete(deleteRefs[j]);
      }
      await batch.commit();
    }

    // Delete cached graphs
    await Promise.all([
      db.collection('entityRelations').doc(uid).delete(),
      db.collection('entityFlows').doc(uid).delete(),
      db.collection('entityPlaceMaps').doc(uid).delete(),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (isFirebaseAuthError(err)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[email/clear-analysis] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to clear email analysis data' }, { status: 500 });
  }
}
