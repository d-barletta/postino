import { NextRequest, NextResponse } from 'next/server';
import { buildOpenRouterChatCompletionTrackingFields, getOpenRouterClient } from '@/lib/openrouter';
import { verifyAdminRequest, handleAdminError } from '@/lib/api-auth';

function maskKey(key: string): string {
  if (!key) return '(empty)';
  if (key.length <= 12) return '***';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    const adminUser = await verifyAdminRequest(request);

    const { client, model, apiKey } = await getOpenRouterClient({
      userId: adminUser.email ?? '',
      sessionId: `admin-test-llm:${adminUser.id}`,
    });

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
        ...buildOpenRouterChatCompletionTrackingFields({
          userId: adminUser.email ?? '',
          sessionId: `admin-test-llm:${adminUser.id}`,
        }),
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
    return handleAdminError(error, 'admin/test-llm POST');
  }
}
