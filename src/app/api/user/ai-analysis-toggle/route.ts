import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

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
    return handleUserError(error, 'user/ai-analysis-toggle PATCH');
  }
}
