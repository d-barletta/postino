import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

interface OpenRouterModel {
  id: string;
  name: string;
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);

  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();
    const apiKey =
      settings?.llmApiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPEN_ROUTER_API_KEY ||
      '';
    const normalizedApiKey = apiKey.trim();

    if (!normalizedApiKey) {
      return NextResponse.json({ models: [], error: 'Missing OpenRouter API key' }, { status: 400 });
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://postino.app',
        'X-Title': 'Postino Email Redirector',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { models: [], error: `OpenRouter request failed (${response.status})`, details },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };

    const models: OpenRouterModel[] = (payload.data || [])
      .filter((m): m is { id: string; name?: string } => Boolean(m.id))
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg, models: [] }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
