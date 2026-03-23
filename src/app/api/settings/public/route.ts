import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { resolveAssignedEmailDomain } from '@/lib/email-utils';

export async function GET() {
  try {
    const db = adminDb();
    const snap = await db.collection('settings').doc('global').get();
    const data = snap.data();

    return NextResponse.json({
      maxRuleLength: data?.maxRuleLength ?? 1000,
      assignedEmailDomain: resolveAssignedEmailDomain(data),
      signupMaintenanceMode: data?.signupMaintenanceMode === true,
    });
  } catch {
    return NextResponse.json({
      maxRuleLength: 1000,
      assignedEmailDomain: resolveAssignedEmailDomain(),
      signupMaintenanceMode: false,
    });
  }
}
