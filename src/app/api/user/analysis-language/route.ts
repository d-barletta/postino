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
    // Allow null or a non-empty string ISO 639-1 code; null clears the preference.
    if (body.analysisOutputLanguage !== null && typeof body.analysisOutputLanguage !== 'string') {
      return NextResponse.json({ error: 'analysisOutputLanguage must be a string or null' }, { status: 400 });
    }

    const raw = body.analysisOutputLanguage === null ? null : (body.analysisOutputLanguage as string).trim() || null;
    // Basic sanity check: accept ISO 639-1 (2 letters) or ISO 639-2 (3 letters) codes, lowercase ASCII only.
    if (raw !== null && !/^[a-z]{2,3}$/.test(raw)) {
      return NextResponse.json({ error: 'analysisOutputLanguage must be a valid ISO 639-1 or ISO 639-2 language code (2-3 lowercase letters)' }, { status: 400 });
    }
    const value = raw;

    const db = adminDb();
    await db.collection('users').doc(decoded.uid).update({ analysisOutputLanguage: value });

    return NextResponse.json({ success: true, analysisOutputLanguage: value });
  } catch (error) {
    console.error('Analysis language update error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
