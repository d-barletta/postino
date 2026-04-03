import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function verifyUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(authHeader.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

/** POST /api/push/register — save an FCM registration token for the current user. */
export async function POST(request: Request) {
  const userId = await verifyUser(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const fcmToken = (body as Record<string, unknown>)?.fcmToken;
  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ success: false, error: 'fcmToken is required' }, { status: 400 });
  }

  try {
    await adminDb()
      .collection('users')
      .doc(userId)
      .update({
        fcmTokens: FieldValue.arrayUnion(fcmToken),
      });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to save FCM token:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

/** DELETE /api/push/register — remove an FCM registration token for the current user. */
export async function DELETE(request: Request) {
  const userId = await verifyUser(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const fcmToken = (body as Record<string, unknown>)?.fcmToken;
  if (!fcmToken || typeof fcmToken !== 'string') {
    return NextResponse.json({ success: false, error: 'fcmToken is required' }, { status: 400 });
  }

  try {
    await adminDb()
      .collection('users')
      .doc(userId)
      .update({
        fcmTokens: FieldValue.arrayRemove(fcmToken),
      });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to remove FCM token:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
