import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

/** The set of language codes accepted for AI analysis output — must match the UI locale selector. */
const SUPPORTED_ANALYSIS_LANGUAGES = new Set(['en', 'it', 'es', 'fr', 'de']);

export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);

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
    const value = raw ?? 'en';

    const supabase = createAdminClient();
    await supabase.from('users').update({ analysis_output_language: value }).eq('id', user.id);

    return NextResponse.json({ success: true, analysisOutputLanguage: value });
  } catch (error) {
    return handleUserError(error, 'user/analysis-language PATCH');
  }
}
