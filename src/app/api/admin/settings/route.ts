import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

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

    const allowed = [
      'maxRuleLength', 'llmModel', 'llmApiKey',
      'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass', 'smtpFrom',
      'emailDomain',
      'mailgunApiKey', 'mailgunWebhookSigningKey', 'mailgunDomain', 'mailgunSandboxEmail', 'mailgunBaseUrl',
    ];
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    await db.collection('settings').doc('global').set(
      { ...filtered, updatedAt: Timestamp.now() },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
