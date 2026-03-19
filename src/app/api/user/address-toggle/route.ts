import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth().verifyIdToken(token);

    const body = await request.json();
    if (typeof body.isAddressEnabled !== 'boolean') {
      return NextResponse.json({ error: 'isAddressEnabled must be a boolean' }, { status: 400 });
    }

    const db = adminDb();
    await db.collection('users').doc(decoded.uid).update({ isAddressEnabled: body.isAddressEnabled });

    return NextResponse.json({ success: true, isAddressEnabled: body.isAddressEnabled });
  } catch (error) {
    console.error('Address toggle error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
