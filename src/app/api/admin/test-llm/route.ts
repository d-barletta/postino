import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getOpenRouterClient } from '@/lib/openrouter';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.split('Bearer ')[1];
  const decoded = await adminAuth().verifyIdToken(token);
  const db = adminDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  if (!userSnap.data()?.isAdmin) throw new Error('Forbidden');
  return decoded;
}

function maskKey(key: string): string {
  if (!key) return '(empty)';
  if (key.length <= 12) return '***';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);

    const { client, model, apiKey } = await getOpenRouterClient();

    const diagnostics: Record<string, unknown> = {
      keySource: apiKey ? 'resolved' : 'missing',
      keyPreview: maskKey(apiKey),
      model,
    };

    // Test a minimal chat completion through the same SDK path used by the inbound route
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Say "ok" only.' }],
        max_tokens: 5,
      });
      diagnostics.chatCompletion = 'ok';
      diagnostics.chatResponse = response.choices[0]?.message?.content ?? '';
    } catch (err) {
      diagnostics.chatCompletion = 'error';
      diagnostics.chatError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json(diagnostics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 });
  }
}
