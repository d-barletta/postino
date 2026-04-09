import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

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
    return handleUserError(error, 'user/forwarding-header-toggle PATCH');
  }
}
