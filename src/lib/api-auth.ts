import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const UNAUTHORIZED_ERROR = 'Unauthorized';
const FORBIDDEN_ERROR = 'Forbidden';
const EMAIL_NOT_VERIFIED_ERROR = 'Email not verified';

export function isAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : '';
  return (
    msg === UNAUTHORIZED_ERROR || msg === FORBIDDEN_ERROR || msg === EMAIL_NOT_VERIFIED_ERROR
  );
}

function assertEmailVerified(user: User) {
  if (!user.email_confirmed_at) {
    throw new Error(EMAIL_NOT_VERIFIED_ERROR);
  }
}

/**
 * Verifies that the request carries a valid Supabase Bearer token.
 * Throws 'Unauthorized' if the token is missing or invalid.
 */
export async function verifyUserRequest(request: NextRequest): Promise<User> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error(UNAUTHORIZED_ERROR);
  const token = authHeader.substring(7);
  const supabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error(UNAUTHORIZED_ERROR);
  assertEmailVerified(user);
  return user;
}

/**
 * Verifies that the request carries a valid Bearer token belonging to an admin user.
 * Throws 'Forbidden' if the user does not have is_admin = true.
 */
export async function verifyAdminRequest(request: NextRequest): Promise<User> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error(UNAUTHORIZED_ERROR);
  const token = authHeader.substring(7);
  const supabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error(UNAUTHORIZED_ERROR);
  assertEmailVerified(user);
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!userData?.is_admin) throw new Error(FORBIDDEN_ERROR);
  return user;
}

export function handleAdminError(error: unknown, context: string): NextResponse {
  const msg = error instanceof Error ? error.message : 'Error';
  const status =
    msg === FORBIDDEN_ERROR || msg === EMAIL_NOT_VERIFIED_ERROR
      ? 403
      : msg === UNAUTHORIZED_ERROR
        ? 401
        : 500;
  if (status === 500) console.error(`[${context}] error:`, error);
  return NextResponse.json({ error: msg }, { status });
}

export function handleUserError(error: unknown, context: string): NextResponse {
  if (
    isAuthError(error) ||
    (error instanceof Error &&
      (error.message === UNAUTHORIZED_ERROR ||
        error.message === FORBIDDEN_ERROR ||
        error.message === EMAIL_NOT_VERIFIED_ERROR))
  ) {
    const status =
      error instanceof Error &&
      (error.message === FORBIDDEN_ERROR || error.message === EMAIL_NOT_VERIFIED_ERROR)
        ? 403
        : 401;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status },
    );
  }
  console.error(`[${context}] error:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
