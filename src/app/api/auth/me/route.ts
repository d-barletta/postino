import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateAssignedEmail, resolveAssignedEmailDomain } from '@/lib/email-utils';

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  const maybeTimestamp = value as { toDate?: () => Date };
  if (typeof maybeTimestamp.toDate === 'function') {
    return maybeTimestamp.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const db = adminDb();
    const userRef = db.collection('users').doc(decoded.uid);
    let userSnap = await userRef.get();

    if (!userSnap.exists) {
      const settingsSnap = await db.collection('settings').doc('global').get();
      const domain = resolveAssignedEmailDomain(settingsSnap.data());
      await userRef.set({
        email: decoded.email ?? '',
        assignedEmail: generateAssignedEmail(domain),
        createdAt: new Date(),
        isAdmin: false,
        isActive: false,
        suspended: false,
      });
      userSnap = await userRef.get();
    } else {
      if (userSnap.data()?.suspended) {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
      }
      if (decoded.email_verified && !userSnap.data()?.isActive && !userSnap.data()?.suspended) {
        await userRef.update({ isActive: true });
        userSnap = await userRef.get();
      }
    }

    const settingsSnap = await db.collection('settings').doc('global').get();
    const domain = resolveAssignedEmailDomain(settingsSnap.data());
    const assignedEmail = userSnap.data()?.assignedEmail as string | undefined;
    const localPart = assignedEmail?.split('@')[0]?.trim();

    if (localPart && assignedEmail?.toLowerCase() !== `${localPart}@${domain}`.toLowerCase()) {
      await userRef.update({ assignedEmail: `${localPart}@${domain}`.toLowerCase() });
      userSnap = await userRef.get();
    }

    const userData = userSnap.data()!;
    return NextResponse.json({
      user: {
        uid: decoded.uid,
        ...userData,
        createdAt: toIsoDate(userData.createdAt),
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
