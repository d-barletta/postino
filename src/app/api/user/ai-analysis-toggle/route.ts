import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, isFirebaseAuthError } from '@/lib/api-auth';

export async function PATCH(request: NextRequest) {
  try {
    const decoded = await verifyUserRequest(request);

    const body = await request.json();
    if (typeof body.isAiAnalysisOnlyEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'isAiAnalysisOnlyEnabled must be a boolean' },
        { status: 400 },
      );
    }

    const db = adminDb();
    await db
      .collection('users')
      .doc(decoded.uid)
      .update({ isAiAnalysisOnlyEnabled: body.isAiAnalysisOnlyEnabled });

    return NextResponse.json({
      success: true,
      isAiAnalysisOnlyEnabled: body.isAiAnalysisOnlyEnabled,
    });
  } catch (error) {
    if (isFirebaseAuthError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('AI analysis toggle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
