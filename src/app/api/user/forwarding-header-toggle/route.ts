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
    if (typeof body.isForwardingHeaderEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'isForwardingHeaderEnabled must be a boolean' },
        { status: 400 },
      );
    }

    const db = adminDb();
    await db
      .collection('users')
      .doc(decoded.uid)
      .update({ isForwardingHeaderEnabled: body.isForwardingHeaderEnabled });

    return NextResponse.json({
      success: true,
      isForwardingHeaderEnabled: body.isForwardingHeaderEnabled,
    });
  } catch (error) {
    console.error('Forwarding header toggle error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
