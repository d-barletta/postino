import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const supabase = createAdminClient();
    const { data: rules } = await supabase
      .from('rules')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    return NextResponse.json({
      rules: (rules ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        text: r.text,
        matchSender: r.match_sender,
        matchSubject: r.match_subject,
        matchBody: r.match_body,
        isActive: r.is_active,
        sortOrder: r.sort_order,
        createdAt: r.created_at ?? null,
        updatedAt: r.updated_at ?? null,
      })),
    });
  } catch (err) {
    return handleUserError(err, 'rules GET');
  }
}

const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

/**
 * Validates a match pattern string for ReDoS safety.
 * Patterns are matched via String.prototype.includes() (plain-text substring), not regex.
 * This guard rejects strings that contain nested quantifiers or other catastrophic structures
 * that would be dangerous if the pattern were ever evaluated as a regular expression.
 * Returns an error message string if invalid, or null if safe.
 */
function validateMatchPattern(pattern: string): string | null {
  // Check the pattern compiles as a regex (catches invalid regex syntax)
  try {
    new RegExp(pattern);
  } catch {
    return 'Pattern contains invalid regular expression syntax';
  }
  // Reject patterns with nested quantifiers that cause catastrophic backtracking
  // e.g. (a+)+, (a*)*, (.+)+, (a{1,10}){2,}, etc.
  if (/\([^)]*[+*{][^)]*\)[+*{]/.test(pattern)) {
    return 'Pattern contains nested quantifiers which could cause catastrophic backtracking';
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const { name, text, matchSender, matchSubject, matchBody } = await request.json();

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    }

    if (name.trim().length > MAX_RULE_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Rule text is required' }, { status: 400 });
    }

    if (
      matchSender !== undefined &&
      (typeof matchSender !== 'string' || matchSender.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Sender pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (matchSender && typeof matchSender === 'string' && matchSender.trim()) {
      const patternErr = validateMatchPattern(matchSender.trim());
      if (patternErr) {
        return NextResponse.json({ error: `Sender pattern: ${patternErr}` }, { status: 400 });
      }
    }

    if (
      matchSubject !== undefined &&
      (typeof matchSubject !== 'string' || matchSubject.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Subject pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (matchSubject && typeof matchSubject === 'string' && matchSubject.trim()) {
      const patternErr = validateMatchPattern(matchSubject.trim());
      if (patternErr) {
        return NextResponse.json({ error: `Subject pattern: ${patternErr}` }, { status: 400 });
      }
    }

    if (
      matchBody !== undefined &&
      (typeof matchBody !== 'string' || matchBody.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Body pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (matchBody && typeof matchBody === 'string' && matchBody.trim()) {
      const patternErr = validateMatchPattern(matchBody.trim());
      if (patternErr) {
        return NextResponse.json({ error: `Body pattern: ${patternErr}` }, { status: 400 });
      }
    }

    const supabase = createAdminClient();

    // Fetch name-uniqueness check, settings and user doc in parallel.
    const [existingResult, settingsResult, userResult] = await Promise.all([
      supabase
        .from('rules')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', name.trim())
        .limit(1)
        .maybeSingle(),
      supabase.from('settings').select('data').eq('id', 'global').single(),
      supabase.from('users').select('is_admin').eq('id', user.id).single(),
    ]);

    if (existingResult.data) {
      return NextResponse.json({ error: 'A rule with this name already exists' }, { status: 409 });
    }

    const settingsData = (settingsResult.data?.data as Record<string, unknown>) ?? {};
    const maxRuleLength = (settingsData?.maxRuleLength as number | undefined) ?? 1000;

    if (text.length > maxRuleLength) {
      return NextResponse.json(
        { error: `Rule exceeds maximum length of ${maxRuleLength}` },
        { status: 400 },
      );
    }

    const maxActiveRules = (settingsData?.maxActiveRules as number | undefined) ?? 3;
    const isAdmin = !!userResult.data?.is_admin;

    if (!isAdmin) {
      const { count: activeRulesCount } = await supabase
        .from('rules')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true);

      if ((activeRulesCount ?? 0) >= maxActiveRules) {
        return NextResponse.json(
          { error: `You have reached the maximum of ${maxActiveRules} active rules` },
          { status: 400 },
        );
      }
    }

    const now = new Date().toISOString();
    const { data: newRule } = await supabase
      .from('rules')
      .insert({
        user_id: user.id,
        name: name.trim(),
        text: text.trim(),
        match_sender: matchSender?.trim() || '',
        match_subject: matchSubject?.trim() || '',
        match_body: matchBody?.trim() || '',
        created_at: now,
        updated_at: now,
        is_active: true,
      })
      .select('id')
      .single();

    return NextResponse.json({ id: newRule?.id }, { status: 201 });
  } catch (error) {
    return handleUserError(error, 'rules POST');
  }
}
