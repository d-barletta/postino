import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Returns true when the error originates from Firebase token verification
 * (e.g. missing, expired, or invalid ID token). Use this to distinguish
 * authentication failures from unexpected internal errors.
 */
export function isFirebaseAuthError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  if (code?.startsWith('auth/')) return true;
  const msg = error instanceof Error ? error.message : '';
  return msg === 'Unauthorized' || msg.includes('Firebase ID token');
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
