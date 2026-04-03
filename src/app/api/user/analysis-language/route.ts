import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { isFirebaseAuthError } from '@/lib/api-auth';

/** The set of language codes accepted for AI analysis output — must match the UI locale selector. */
const SUPPORTED_ANALYSIS_LANGUAGES = new Set(['en', 'it', 'es', 'fr', 'de']);

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = await adminAuth().verifyIdToken(token);

    const body = await request.json();
    // Allow null or one of the supported language codes; null clears the preference.
    if (body.analysisOutputLanguage !== null && typeof body.analysisOutputLanguage !== 'string') {
      return NextResponse.json(
        { error: 'analysisOutputLanguage must be a string or null' },
        { status: 400 },
      );
    }

    const raw =
      body.analysisOutputLanguage === null
        ? null
        : (body.analysisOutputLanguage as string).trim() || null;
    if (raw !== null && !SUPPORTED_ANALYSIS_LANGUAGES.has(raw)) {
      return NextResponse.json(
        {
          error: `analysisOutputLanguage must be one of: ${[...SUPPORTED_ANALYSIS_LANGUAGES].join(', ')}`,
        },
        { status: 400 },
      );
    }
    const value = raw;

    const db = adminDb();
    await db.collection('users').doc(decoded.uid).update({ analysisOutputLanguage: value });

    return NextResponse.json({ success: true, analysisOutputLanguage: value });
  } catch (error) {
    if (isFirebaseAuthError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Analysis language update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
