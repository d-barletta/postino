import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// DELETE – remove all entity-related data for the authenticated user:
//   • emailLogs[].emailAnalysis.entities/topics/tags – extracted entity fields
//   • entityMerges        – user-defined entity merge rules
//   • entityMergeSuggestions – AI-generated merge suggestions
//   • entityRelations/{uid} – cached relation graph
//   • entityFlows/{uid}   – cached flow graph
//   • entityPlaceMaps/{uid} – cached place map
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);
    const db = adminDb();
    const uid = decoded.uid;

    // Fetch all entityMerges, entityMergeSuggestions, and emailLogs in parallel
    const [mergesSnap, suggestionsSnap, logsSnap] = await Promise.all([
      db.collection('entityMerges').where('userId', '==', uid).get(),
      db.collection('entityMergeSuggestions').where('userId', '==', uid).get(),
      db.collection('emailLogs').where('userId', '==', uid).get(),
    ]);

    // Delete merges and suggestions in batches of BATCH_SIZE
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

    // Clear extracted entity fields from email logs (only docs that have emailAnalysis)
    const analyzedLogs = logsSnap.docs.filter((d) => !!d.data().emailAnalysis);
    for (let i = 0; i < analyzedLogs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = analyzedLogs.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        batch.update(doc.ref, {
          'emailAnalysis.entities': FieldValue.delete(),
          'emailAnalysis.topics': FieldValue.delete(),
          'emailAnalysis.tags': FieldValue.delete(),
        });
      }
      await batch.commit();
    }

    // Delete cached graphs (single documents keyed by userId)
    await Promise.all([
      db.collection('entityRelations').doc(uid).delete(),
      db.collection('entityFlows').doc(uid).delete(),
      db.collection('entityPlaceMaps').doc(uid).delete(),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'entities/all DELETE');
  }
}
