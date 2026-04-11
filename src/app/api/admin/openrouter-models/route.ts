import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

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

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('data')
      .eq('id', 'global')
      .single();
    const settings = (settingsRow?.data ?? {}) as Record<string, unknown>;
    const apiKey =
      (settings.llmApiKey as string | undefined) || process.env.OPEN_ROUTER_API_KEY || '';
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
    return handleAdminError(error, 'admin/openrouter-models GET');
  }
}
