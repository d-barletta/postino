import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';

const MAX_RULE_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 200;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const { data: ruleData } = await supabase.from('rules').select('*').eq('id', id).single();

    if (!ruleData || ruleData.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { name, text, isActive, matchSender, matchSubject, matchBody } = await request.json();

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
    }

    if (isActive === true && !ruleData.is_active) {
      const [settingsResult, userResult] = await Promise.all([
        supabase.from('settings').select('data').eq('id', 'global').single(),
        supabase.from('users').select('is_admin').eq('id', user.id).single(),
      ]);
      const settingsData = (settingsResult.data?.data as Record<string, unknown>) ?? {};
      const maxActiveRules = (settingsData?.maxActiveRules as number | undefined) ?? 3;
      const isUserAdmin = !!userResult.data?.is_admin;

      if (!isUserAdmin) {
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
    }

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
      }

      if (name.trim().length > MAX_RULE_NAME_LENGTH) {
        return NextResponse.json(
          { error: `Rule name must be at most ${MAX_RULE_NAME_LENGTH} characters` },
          { status: 400 },
        );
      }

      // Check name uniqueness (exclude current rule)
      const { data: existing } = await supabase
        .from('rules')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', name.trim())
        .limit(1)
        .maybeSingle();

      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: 'A rule with this name already exists' },
          { status: 409 },
        );
      }
    }

    if (text !== undefined) {
      if (typeof text !== 'string' || !text.trim()) {
        return NextResponse.json(
          { error: 'Rule text must be a non-empty string' },
          { status: 400 },
        );
      }

      const { data: settingsRow } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'global')
        .single();
      const settingsData = (settingsRow?.data as Record<string, unknown>) ?? {};
      const maxRuleLength = (settingsData?.maxRuleLength as number | undefined) ?? 1000;
      if (text.length > maxRuleLength) {
        return NextResponse.json(
          { error: `Rule exceeds maximum length of ${maxRuleLength}` },
          { status: 400 },
        );
      }
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

    if (
      matchSubject !== undefined &&
      (typeof matchSubject !== 'string' || matchSubject.length > MAX_PATTERN_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Subject pattern must be a string of at most ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
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

    const updateData: import('@/types/supabase').Database['public']['Tables']['rules']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);
    if (text !== undefined) updateData.text = text.trim();
    if (name !== undefined) updateData.name = name.trim();
    if (matchSender !== undefined) updateData.match_sender = matchSender?.trim() || '';
    if (matchSubject !== undefined) updateData.match_subject = matchSubject?.trim() || '';
    if (matchBody !== undefined) updateData.match_body = matchBody?.trim() || '';

    await supabase.from('rules').update(updateData).eq('id', id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'rules/[id] PUT');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await verifyUserRequest(request);
    const { id } = await params;
    const supabase = createAdminClient();
    const { data: ruleData } = await supabase.from('rules').select('user_id').eq('id', id).single();

    if (!ruleData || ruleData.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await supabase.from('rules').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleUserError(err, 'rules/[id] DELETE');
  }
}
