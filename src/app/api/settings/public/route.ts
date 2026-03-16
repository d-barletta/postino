import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const db = adminDb();
    const snap = await db.collection('settings').doc('global').get();
    const data = snap.data();

    return NextResponse.json({
      maxRuleLength: data?.maxRuleLength ?? 1000,
    });
  } catch {
    return NextResponse.json({ maxRuleLength: 1000 });
  }
}
