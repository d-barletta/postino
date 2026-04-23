/**
 * Supabase database helpers.
 *
 * All server-side DB operations use the service-role admin client (bypasses RLS).
 * Column naming follows Postgres snake_case conventions.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/supabase';
import type { User, Rule, EmailLog, Settings } from '@/types';
import { DEFAULT_CREDITS_PER_DOLLAR_FACTOR, DEFAULT_FREE_CREDITS_PER_MONTH } from '@/lib/credits';
import { SYSTEM_RULE_AI_SKIPPED_CREDITS } from '@/lib/email-sentinel-rules';

type UserUpdate = Database['public']['Tables']['users']['Update'];
type RuleUpdate = Database['public']['Tables']['rules']['Update'];

// ---------------------------------------------------------------------------
// Row ↔ domain type mappers
// ---------------------------------------------------------------------------

function rowToUser(row: any): User {
  return {
    uid: row.id,
    email: row.email,
    assignedEmail: row.assigned_email,
    createdAt: new Date(row.created_at),
    isAdmin: row.is_admin,
    isActive: row.is_active,
    isAddressEnabled: row.is_address_enabled,
    isAiAnalysisOnlyEnabled: row.is_ai_analysis_only_enabled,
    isForwardingHeaderEnabled: row.is_forwarding_header_enabled,
    displayName: row.display_name ?? undefined,
    analysisOutputLanguage: row.analysis_output_language ?? 'en',
    monthlyCreditsUsed: row.monthly_credits_used ?? 0,
    monthlyCreditsBonus: row.monthly_credits_bonus ?? 0,
  };
}

function rowToRule(row: any): Rule {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    text: row.text,
    matchSender: row.match_sender ?? undefined,
    matchSubject: row.match_subject ?? undefined,
    matchBody: row.match_body ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isActive: row.is_active,
    sortOrder: row.sort_order ?? undefined,
  };
}

function rowToEmailLog(row: any): EmailLog {
  return {
    id: row.id,
    toAddress: row.to_address,
    fromAddress: row.from_address,
    ccAddress: row.cc_address ?? undefined,
    bccAddress: row.bcc_address ?? undefined,
    subject: row.subject ?? '',
    receivedAt: row.received_at ? new Date(row.received_at) : new Date(),
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    status: row.status,
    ruleApplied: row.rule_applied ?? undefined,
    tokensUsed: row.tokens_used ?? undefined,
    estimatedCost: row.estimated_cost ?? undefined,
    estimatedCredits: row.estimated_credits ?? undefined,
    userId: row.user_id,
    originalBody: row.original_body ?? undefined,
    // When AI was skipped (credits exhausted), processed_body is set to the forwarded body
    // (same as original) — suppress it so UI toggles don't appear.
    processedBody:
      row.rule_applied === SYSTEM_RULE_AI_SKIPPED_CREDITS
        ? undefined
        : (row.processed_body ?? undefined),
    errorMessage: row.error_message ?? undefined,
    attachmentCount: row.attachment_count ?? undefined,
    attachmentNames: row.attachment_names ?? undefined,
    emailAnalysis: row.email_analysis ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export async function getUserById(uid: string): Promise<User | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('users').select('*').eq('id', uid).single();
  if (error || !data) return null;
  return rowToUser(data);
}

export async function createUser(uid: string, data: Omit<User, 'uid'>): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('users').insert({
    id: uid,
    email: data.email,
    assigned_email: data.assignedEmail,
    created_at: data.createdAt.toISOString(),
    is_admin: data.isAdmin,
    is_active: data.isActive,
    is_address_enabled: data.isAddressEnabled ?? true,
    is_ai_analysis_only_enabled: data.isAiAnalysisOnlyEnabled ?? false,
    is_forwarding_header_enabled: data.isForwardingHeaderEnabled ?? true,
    display_name: data.displayName ?? null,
    analysis_output_language: data.analysisOutputLanguage ?? 'en',
    monthly_credits_used: data.monthlyCreditsUsed ?? 0,
    monthly_credits_bonus: data.monthlyCreditsBonus ?? 0,
  });
  if (error) console.error('[lib/database] createUser failed:', error);
}

export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  const supabase = createAdminClient();

  const updates: UserUpdate = {};
  if (data.email !== undefined) updates.email = data.email;
  if (data.assignedEmail !== undefined) updates.assigned_email = data.assignedEmail;
  if (data.isAdmin !== undefined) updates.is_admin = data.isAdmin;
  if (data.isActive !== undefined) updates.is_active = data.isActive;
  if (data.isAddressEnabled !== undefined) updates.is_address_enabled = data.isAddressEnabled;
  if (data.isAiAnalysisOnlyEnabled !== undefined)
    updates.is_ai_analysis_only_enabled = data.isAiAnalysisOnlyEnabled;
  if (data.isForwardingHeaderEnabled !== undefined)
    updates.is_forwarding_header_enabled = data.isForwardingHeaderEnabled;
  if (data.displayName !== undefined) updates.display_name = data.displayName;
  if (data.analysisOutputLanguage !== undefined)
    updates.analysis_output_language = data.analysisOutputLanguage;
  if (data.monthlyCreditsUsed !== undefined) updates.monthly_credits_used = data.monthlyCreditsUsed;
  if (data.monthlyCreditsBonus !== undefined)
    updates.monthly_credits_bonus = data.monthlyCreditsBonus;
  const { error } = await supabase.from('users').update(updates).eq('id', uid);
  if (error) console.error('[lib/database] updateUser failed:', error);
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

export async function getRulesByUser(userId: string, limitCount = 200): Promise<Rule[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limitCount);
  return (data ?? []).map(rowToRule);
}

export async function createRule(data: Omit<Rule, 'id'>): Promise<string> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('rules')
    .insert({
      user_id: data.userId,
      name: data.name,
      text: data.text,
      match_sender: data.matchSender ?? null,
      match_subject: data.matchSubject ?? null,
      match_body: data.matchBody ?? null,
      created_at: data.createdAt.toISOString(),
      updated_at: data.updatedAt.toISOString(),
      is_active: data.isActive,
      sort_order: data.sortOrder ?? null,
    })
    .select('id')
    .single();
  if (error) console.error('[lib/database] createRule failed:', error);
  return row?.id ?? '';
}

export async function updateRule(id: string, data: Partial<Rule>): Promise<void> {
  const supabase = createAdminClient();

  const updates: RuleUpdate = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.text !== undefined) updates.text = data.text;
  if (data.matchSender !== undefined) updates.match_sender = data.matchSender;
  if (data.matchSubject !== undefined) updates.match_subject = data.matchSubject;
  if (data.matchBody !== undefined) updates.match_body = data.matchBody;
  if (data.isActive !== undefined) updates.is_active = data.isActive;
  if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
  if (data.updatedAt) updates.updated_at = data.updatedAt.toISOString();
  const { error } = await supabase.from('rules').update(updates).eq('id', id);
  if (error) console.error('[lib/database] updateRule failed:', error);
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('rules').delete().eq('id', id);
  if (error) console.error('[lib/database] deleteRule failed:', error);
}

// ---------------------------------------------------------------------------
// EmailLog helpers
// ---------------------------------------------------------------------------

export async function getEmailLogsByUser(userId: string, limitCount = 50): Promise<EmailLog[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('email_logs')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(limitCount);
  return (data ?? []).map(rowToEmailLog);
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Settings | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('settings')
    .select('data, updated_at')
    .eq('id', 'global')
    .single();
  if (!data) return null;
  const raw = (data.data as Record<string, unknown>) ?? {};
  return {
    ...(raw as unknown as Settings),
    creditsPerDollarFactor:
      typeof raw.creditsPerDollarFactor === 'number'
        ? raw.creditsPerDollarFactor
        : DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
    freeCreditsPerMonth:
      typeof raw.freeCreditsPerMonth === 'number'
        ? raw.freeCreditsPerMonth
        : DEFAULT_FREE_CREDITS_PER_MONTH,
    updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
  };
}
