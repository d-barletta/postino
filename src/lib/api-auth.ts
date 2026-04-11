import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export function isAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : '';
  return msg === 'Unauthorized' || msg === 'Forbidden';
}

/**
 * Verifies that the request carries a valid Supabase Bearer token.
 * Throws 'Unauthorized' if the token is missing or invalid.
 */
export async function verifyUserRequest(request: NextRequest): Promise<User> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  const supabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  return user;
}

/**
 * Verifies that the request carries a valid Bearer token belonging to an admin user.
 * Throws 'Forbidden' if the user does not have is_admin = true.
 */
export async function verifyAdminRequest(request: NextRequest): Promise<User> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  const supabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!userData?.is_admin) throw new Error('Forbidden');
  return user;
}

export function handleAdminError(error: unknown, context: string): NextResponse {
  const msg = error instanceof Error ? error.message : 'Error';
  const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
  if (status === 500) console.error(`[${context}] error:`, error);
  return NextResponse.json({ error: msg }, { status });
}

export function handleUserError(error: unknown, context: string): NextResponse {
  if (
    isAuthError(error) ||
    (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden'))
  ) {
    const status = error instanceof Error && error.message === 'Forbidden' ? 403 : 401;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized' },
      { status },
    );
  }
  console.error(`[${context}] error:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
