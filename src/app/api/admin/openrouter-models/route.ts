import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAdminRequest } from '@/lib/api-auth';

interface OpenRouterModel {
  id: string;
  name: string;
}

interface OpenRouterModelRaw {
  id?: string;
  name?: string;
  supported_parameters?: string[];
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request);

    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.data();
    const apiKey = settings?.llmApiKey || process.env.OPEN_ROUTER_API_KEY || '';
    const normalizedApiKey = apiKey.trim();

    if (!normalizedApiKey) {
      return NextResponse.json(
        { models: [], error: 'Missing OpenRouter API key' },
        { status: 400 },
      );
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://postino.pro',
        'X-Title': 'Postino Email Redirector',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { models: [], error: `OpenRouter request failed (${response.status})`, details },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      data?: OpenRouterModelRaw[];
    };

    const models: OpenRouterModel[] = (payload.data || [])
      .filter(
        (m): m is OpenRouterModelRaw & { id: string } =>
          Boolean(m.id) &&
          Array.isArray(m.supported_parameters) &&
          m.supported_parameters.includes('structured_outputs'),
      )
      .map((m) => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[admin/openrouter-models] error:', error);
    return NextResponse.json({ error: msg, models: [] }, { status });
  }
}
