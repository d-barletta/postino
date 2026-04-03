import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.substring(7);
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
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const code = (error as { code?: string }).code;
    if (code?.startsWith('auth/') || msg === 'Unauthorized' || msg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Forwarding header toggle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
