import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateAssignedEmail } from '@/lib/email';

const MAX_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const domain = settingsSnap.data()?.emailDomain || 'sandbox.postino.app';

    // Generate a unique email address with collision detection
    let newEmail = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = generateAssignedEmail(domain);
      const existing = await db
        .collection('users')
        .where('assignedEmail', '==', candidate)
        .limit(1)
        .get();
      if (existing.empty) {
        newEmail = candidate;
        break;
      }
    }

    if (!newEmail) {
      return NextResponse.json({ error: 'Could not generate a unique email address' }, { status: 500 });
    }

    await db.collection('users').doc(decoded.uid).update({ assignedEmail: newEmail });

    return NextResponse.json({ assignedEmail: newEmail });
  } catch (error) {
    console.error('Generate email error:', error);
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 });
  }
}
