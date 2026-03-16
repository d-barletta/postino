import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateAssignedEmail } from '@/lib/email';

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

    const newEmail = generateAssignedEmail(domain);
    await db.collection('users').doc(decoded.uid).update({ assignedEmail: newEmail });

    return NextResponse.json({ assignedEmail: newEmail });
  } catch (error) {
    console.error('Generate email error:', error);
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 });
  }
}
