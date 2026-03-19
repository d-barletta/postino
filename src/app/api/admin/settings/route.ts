import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';

const USER_UPDATE_BATCH_SIZE = 400;

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = adminDb();
    const snap = await db.collection('settings').doc('global').get();

    if (!snap.exists) {
      return NextResponse.json({ settings: {} });
    }

    const data = snap.data()!;
    return NextResponse.json({
      settings: {
        ...data,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const updates = await request.json();
    const db = adminDb();
    const settingsRef = db.collection('settings').doc('global');
    const currentSettingsSnap = await settingsRef.get();
    const currentSettings = currentSettingsSnap.data() || {};

    const allowed = [
      'maxRuleLength', 'llmModel', 'llmApiKey', 'llmMaxTokens', 'llmSystemPrompt', 'emailSubjectPrefix',
      'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpFrom',
      'emailDomain',
      'mailgunApiKey', 'mailgunWebhookSigningKey', 'mailgunDomain', 'mailgunSandboxEmail', 'mailgunBaseUrl',
      'maintenanceMode',
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    const normalized = Object.fromEntries(
      Object.entries(filtered).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ])
    );

    const nextSettings = { ...currentSettings, ...normalized };
    const previousAssignedEmailDomain = resolveAssignedEmailDomain(currentSettings);
    const nextAssignedEmailDomain = resolveAssignedEmailDomain(nextSettings);

    await settingsRef.set(
      { ...normalized, updatedAt: Timestamp.now() },
      { merge: true }
    );

    let reassignedUsers = 0;

    if (previousAssignedEmailDomain !== nextAssignedEmailDomain) {
      const usersSnap = await db.collection('users').get();

      for (let i = 0; i < usersSnap.docs.length; i += USER_UPDATE_BATCH_SIZE) {
        const batch = db.batch();
        const docs = usersSnap.docs.slice(i, i + USER_UPDATE_BATCH_SIZE);

        for (const userDoc of docs) {
          const assignedEmail = userDoc.data().assignedEmail as string | undefined;
          if (!assignedEmail) continue;

          const localPart = assignedEmail.split('@')[0]?.trim();
          if (!localPart) continue;

          batch.update(userDoc.ref, {
            assignedEmail: `${localPart}@${nextAssignedEmailDomain}`.toLowerCase(),
          });
          reassignedUsers += 1;
        }

        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      assignedEmailDomain: nextAssignedEmailDomain,
      reassignedUsers,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
