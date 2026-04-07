import { NextRequest, NextResponse } from 'next/server';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebase-admin';
import { verifyAdminRequest } from '@/lib/api-auth';
import {
  generateAssignedEmail,
  isEmailUsingDomain,
  resolveAssignedEmailDomain,
} from '@/lib/email-utils';

/** Maximum write operations per Firestore batch (hard limit is 500). */
const BATCH_SIZE = 400;
const IN_QUERY_LIMIT = 30;
const MAX_ASSIGNED_EMAIL_ATTEMPTS = 10;

function dedupeRefs(refs: DocumentReference[]): DocumentReference[] {
  const unique = new Map<string, DocumentReference>();
  for (const ref of refs) {
    unique.set(ref.path, ref);
  }
  return Array.from(unique.values());
}

async function deleteRefsInBatches(refs: DocumentReference[]): Promise<void> {
  const db = adminDb();
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = refs.slice(i, i + BATCH_SIZE);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function queryRefsByIds(
  collection: string,
  fieldPath: string,
  ids: string[],
): Promise<DocumentReference[]> {
  if (ids.length === 0) return [];

  const db = adminDb();
  const refs: DocumentReference[] = [];

  for (let i = 0; i < ids.length; i += IN_QUERY_LIMIT) {
    const chunk = ids.slice(i, i + IN_QUERY_LIMIT);
    const snap = await db.collection(collection).where(fieldPath, 'in', chunk).get();
    refs.push(...snap.docs.map((doc) => doc.ref));
  }

  return refs;
}

async function deleteUserStorageArtifacts(logIds: string[]): Promise<void> {
  if (logIds.length === 0) return;

  try {
    const bucket = adminStorage().bucket();

    for (const logId of logIds) {
      const prefixes = [`email-attachments/${logId}/`, `mailgun-webhook-logs/${logId}/`];

      for (const prefix of prefixes) {
        const [files] = await bucket.getFiles({ prefix });
        await Promise.all(
          files.map((file) => file.delete({ ignoreNotFound: true }).catch(() => undefined)),
        );
      }
    }
  } catch (error) {
    console.error('[admin/users/[uid]] failed to delete storage artifacts:', error);
  }
}

async function collectUserDataRefs(uid: string): Promise<{
  refsToDelete: DocumentReference[];
  logIds: string[];
}> {
  const db = adminDb();

  const [rulesSnap, logsSnap, entityMergesSnap, entityMergeSuggestionsSnap, jobsSnap] =
    await Promise.all([
      db.collection('rules').where('userId', '==', uid).get(),
      db.collection('emailLogs').where('userId', '==', uid).get(),
      db.collection('entityMerges').where('userId', '==', uid).get(),
      db.collection('entityMergeSuggestions').where('userId', '==', uid).get(),
      db.collection('emailJobs').where('payload.userId', '==', uid).get(),
    ]);

  const logIds = logsSnap.docs.map((doc) => doc.id);
  const jobIds = jobsSnap.docs.map((doc) => doc.id);

  const [webhookRefsByLogId, webhookRefsByJobId] = await Promise.all([
    queryRefsByIds('mailgunWebhookLogs', 'linked.emailLogId', logIds),
    queryRefsByIds('mailgunWebhookLogs', 'linked.jobId', jobIds),
  ]);

  return {
    logIds,
    refsToDelete: dedupeRefs([
      ...rulesSnap.docs.map((doc) => doc.ref),
      ...logsSnap.docs.map((doc) => doc.ref),
      ...entityMergesSnap.docs.map((doc) => doc.ref),
      ...entityMergeSuggestionsSnap.docs.map((doc) => doc.ref),
      ...jobsSnap.docs.map((doc) => doc.ref),
      ...webhookRefsByLogId,
      ...webhookRefsByJobId,
      db.collection('entityRelations').doc(uid),
      db.collection('entityFlows').doc(uid),
      db.collection('entityPlaceMaps').doc(uid),
      db.collection('userMemory').doc(uid),
    ]),
  };
}

async function provisionFreshUserProfile(uid: string, currentUserData: Record<string, unknown>) {
  const db = adminDb();
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.data();
  const assignedDomain = resolveAssignedEmailDomain(settings);

  let authEmail = typeof currentUserData.email === 'string' ? currentUserData.email : '';
  let authDisplayName =
    typeof currentUserData.displayName === 'string' ? currentUserData.displayName.trim() : '';
  let isActive = currentUserData.isActive === true;

  try {
    const authUser = await adminAuth().getUser(uid);
    authEmail = authUser.email ?? authEmail;
    authDisplayName = authUser.displayName?.trim() ?? authDisplayName;
    isActive = authUser.emailVerified;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') {
      throw error;
    }
  }

  if (authEmail && isEmailUsingDomain(authEmail, assignedDomain)) {
    throw new Error("Can't reset an account that uses the managed inbound domain");
  }

  let assignedEmail = '';
  for (let attempt = 0; attempt < MAX_ASSIGNED_EMAIL_ATTEMPTS; attempt++) {
    const candidate = generateAssignedEmail(assignedDomain);
    const existing = await db.collection('users').where('assignedEmail', '==', candidate).limit(1).get();
    if (existing.empty) {
      assignedEmail = candidate;
      break;
    }
  }

  if (!assignedEmail) {
    throw new Error('Failed to provision assigned email');
  }

  await db.collection('users').doc(uid).set({
    email: authEmail,
    assignedEmail,
    createdAt: new Date(),
    isAdmin: false,
    isActive,
    suspended: false,
    analysisOutputLanguage: 'en',
    ...(authDisplayName ? { displayName: authDisplayName } : {}),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const updates = await request.json();
    const { uid } = await params;
    const db = adminDb();

    const allowed = ['isAdmin', 'isActive'];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k)),
    );

    if ('isActive' in filtered) {
      const targetSnap = await db.collection('users').doc(uid).get();
      if (targetSnap.data()?.isAdmin) {
        return NextResponse.json({ error: 'Cannot suspend an admin user' }, { status: 400 });
      }
      filtered.suspended = !filtered.isActive;
    }

    await db.collection('users').doc(uid).update(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users/[uid]] PATCH error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const db = adminDb();

    const targetSnap = await db.collection('users').doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetSnap.data()?.isAdmin) {
      return NextResponse.json({ error: 'Cannot reset an admin user' }, { status: 400 });
    }

    const { refsToDelete, logIds } = await collectUserDataRefs(uid);
    await deleteUserStorageArtifacts(logIds);
    await deleteRefsInBatches(refsToDelete);
    await provisionFreshUserProfile(uid, targetSnap.data() ?? {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users/[uid]] POST error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  try {
    await verifyAdminRequest(request);
    const { uid } = await params;
    const db = adminDb();

    const targetSnap = await db.collection('users').doc(uid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetSnap.data()?.isAdmin) {
      return NextResponse.json({ error: 'Cannot delete an admin user' }, { status: 400 });
    }

    const { refsToDelete, logIds } = await collectUserDataRefs(uid);
    await deleteUserStorageArtifacts(logIds);
    await deleteRefsInBatches([...refsToDelete, db.collection('users').doc(uid)]);

    // Delete Firebase Auth user
    try {
      await adminAuth().deleteUser(uid);
    } catch (authError) {
      const code = (authError as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        console.error(`Failed to delete Firebase Auth user ${uid}:`, authError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/users/[uid]] DELETE error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
