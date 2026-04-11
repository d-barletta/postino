import { createClient } from '@/lib/supabase/client';

function getSupabase() {
  return createClient();
}

function getAuthOrigin() {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : 'http://localhost:3000');

  return configuredOrigin.replace(/\/$/, '');
}

function buildAuthRedirectUrl(pathname: string, searchParams?: URLSearchParams) {
  const url = new URL(pathname, `${getAuthOrigin()}/`);

  if (searchParams) {
    url.search = searchParams.toString();
  }

  return url.toString();
}

const PENDING_VERIFICATION_EMAIL_KEY = 'postino.pendingVerificationEmail';

function getPendingVerificationStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizePendingVerificationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getEmailConfirmationRedirectUrl() {
  return buildAuthRedirectUrl('/auth/confirm');
}

export function getPasswordRecoveryRedirectUrl() {
  return buildAuthRedirectUrl(
    '/auth/confirm',
    new URLSearchParams({
      type: 'recovery',
      next: '/reset-password',
    }),
  );
}

export function setPendingVerificationEmail(email: string) {
  const storage = getPendingVerificationStorage();
  if (!storage) {
    return;
  }

  const normalizedEmail = normalizePendingVerificationEmail(email);
  if (!normalizedEmail) {
    storage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
    return;
  }

  storage.setItem(PENDING_VERIFICATION_EMAIL_KEY, normalizedEmail);
}

export function getPendingVerificationEmail() {
  const storage = getPendingVerificationStorage();
  if (!storage) {
    return null;
  }

  const storedEmail = storage.getItem(PENDING_VERIFICATION_EMAIL_KEY);
  if (!storedEmail) {
    return null;
  }

  const normalizedEmail = normalizePendingVerificationEmail(storedEmail);
  if (!normalizedEmail) {
    storage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
    return null;
  }

  return normalizedEmail;
}

export function clearPendingVerificationEmail() {
  const storage = getPendingVerificationStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
}

export async function registerUser(email: string, password: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getEmailConfirmationRedirectUrl(),
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

  if (!data.user?.email_confirmed_at) {
    setPendingVerificationEmail(email);
  } else {
    clearPendingVerificationEmail();
  }

  if (data.session && !data.user?.email_confirmed_at) {
    await supabase.auth.signOut();
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
      setPendingVerificationEmail(email);
      out.code = 'auth/email-not-verified';
    }
    throw out;
  }

  if (!data.user?.email_confirmed_at) {
    setPendingVerificationEmail(email);
    await supabase.auth.signOut();
    const out = new Error('Email not verified') as Error & { code?: string };
    out.code = 'auth/email-not-verified';
    throw out;
  }

  clearPendingVerificationEmail();
  return data.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordRecoveryRedirectUrl(),
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
