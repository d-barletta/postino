import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

    const body = await request.json();
    if (typeof body.isAddressEnabled !== 'boolean') {
      return NextResponse.json({ error: 'isAddressEnabled must be a boolean' }, { status: 400 });
    }

    const db = adminDb();
    await db
      .collection('users')
      .doc(decoded.uid)
      .update({ isAddressEnabled: body.isAddressEnabled });

    return NextResponse.json({ success: true, isAddressEnabled: body.isAddressEnabled });
  } catch (error) {
    return handleUserError(error, 'user/address-toggle PATCH');
  }
}
