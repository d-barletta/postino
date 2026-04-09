import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { generateAssignedEmail } from '@/lib/email';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const MAX_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const domain = resolveAssignedEmailDomain(settingsSnap.data());

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
      return NextResponse.json(
        { error: 'Could not generate a unique email address' },
        { status: 500 },
      );
    }

    await db.collection('users').doc(decoded.uid).update({ assignedEmail: newEmail });

    return NextResponse.json({ assignedEmail: newEmail });
  } catch (error) {
    return handleUserError(error, 'email/generate POST');
  }
}
