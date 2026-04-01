import type { NextRequest } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Verifies that the request carries a valid Bearer token belonging to an admin
 * user. Throws 'Unauthorized' if the token is missing/invalid, or 'Forbidden'
 * if the user does not have the isAdmin flag.
 */
export async function verifyAdminRequest(request: NextRequest): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}
