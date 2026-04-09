import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Returns true when the error originates from Firebase token verification
 * (e.g. missing, expired, or invalid ID token). Use this to distinguish
 * authentication failures from unexpected internal errors.
 */
export function isFirebaseAuthError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && code.startsWith('auth/')) return true;
  const msg = error instanceof Error ? error.message : '';
  return msg.includes('Firebase ID token');
}

/**
 * Verifies that the request carries a valid Bearer token.
 * Throws 'Unauthorized' if the token is missing or invalid.
 */
export async function verifyUserRequest(request: NextRequest): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  return adminAuth().verifyIdToken(token);
}

/**
 * Verifies that the request carries a valid Bearer token belonging to an admin
 * user. Throws 'Unauthorized' if the token is missing/invalid, or 'Forbidden'
 * if the user does not have the isAdmin flag.
 */
export async function verifyAdminRequest(request: NextRequest): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.substring(7);
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const userData = userSnap.data();
  if (!userData?.isAdmin) throw new Error('Forbidden');
  if (userData?.suspended) throw new Error('Forbidden');
  return decoded;
}

/**
 * Standard error handler for admin routes. Maps 'Forbidden' → 403,
 * 'Unauthorized' → 401, everything else → 500 (with logging).
 */
export function handleAdminError(error: unknown, context: string): NextResponse {
  const msg = error instanceof Error ? error.message : 'Error';
  const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
  if (status === 500) console.error(`[${context}] error:`, error);
  return NextResponse.json({ error: msg }, { status });
}

/**
 * Standard error handler for user-facing routes. Maps Firebase auth errors
 * and explicit 'Unauthorized'/'Forbidden' throws to 401/403; everything else
 * → 500 (with logging).
 */
export function handleUserError(error: unknown, context: string): NextResponse {
  if (
    isFirebaseAuthError(error) ||
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
