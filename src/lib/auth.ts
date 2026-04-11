import { createClient } from '@/lib/supabase/client';

function getSupabase() {
  return createClient();
}

export async function registerUser(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    },
  });
  if (error) {
    const out = new Error(error.message) as Error & { code?: string };
    if (error.message.toLowerCase().includes('already registered')) {
      out.code = 'auth/email-already-in-use';
    } else if (error.message.toLowerCase().includes('password')) {
      out.code = 'auth/weak-password';
    }
    throw out;
  }
  return data.user;
}

export async function loginUser(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const out = new Error(error.message) as Error & { code?: string };
    if (
      error.message.toLowerCase().includes('invalid') ||
      error.message.toLowerCase().includes('credentials')
    ) {
      out.code = 'auth/invalid-credential';
    } else if (error.message.toLowerCase().includes('too many')) {
      out.code = 'auth/too-many-requests';
    } else if (error.message.toLowerCase().includes('not confirmed')) {
      out.code = 'auth/email-not-verified';
    }
    throw out;
  }
  return data.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?type=recovery&next=/reset-password`,
  });
  if (error) throw new Error(error.message);
}

/** Called from /reset-password after session is established via /auth/confirm. */
export async function resetPassword(_actionCode: string, newPassword: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** No-op stub — Supabase validates the reset link automatically via PKCE. */
export async function verifyResetPasswordCode(_actionCode: string): Promise<string> {
  return '';
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut();
}

export async function getIdToken(): Promise<string | null> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  return data?.is_admin ?? false;
}
