import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { buildOpenRouterHeaders, buildOpenRouterProviderOptions } from '@/lib/openrouter';
import {
  buildMemoryChatSystemPrompt,
  getMemoryChatRuntimeConfig,
  normalizeMemoryChatHistory,
  recordMemoryChatUsage,
  resolveMemoryChatErrorStatus,
  resolveMemoryChatUserEmail,
  searchMemoryChatContext,
  validateMemoryChatQuery,
} from '@/lib/memory-chat';
import { verifySandboxMemoryToolToken } from '@/lib/sandbox-memory-tool';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized');
    }

    const claims = verifySandboxMemoryToolToken(authHeader.substring(7));
    const body = (await request.json().catch(() => ({}))) as {
      query?: unknown;
      history?: unknown;
    };

    const query = validateMemoryChatQuery(body.query);
    const history = normalizeMemoryChatHistory(body.history);
    const { supabase, settingsData, memoryApiKey, llmApiKey, llmModel } =
      await getMemoryChatRuntimeConfig();
    const userEmail = await resolveMemoryChatUserEmail(supabase, claims.userId, claims.userEmail);

    const { memoryContext, sourceEmailIds } = await searchMemoryChatContext({
      userId: claims.userId,
      query,
      history,
      memoryApiKey,
    });

    const openRouterTracking = {
      userId: userEmail,
      sessionId: `sandbox-memory:${claims.logId}`,
    };
    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: llmApiKey,
      headers: buildOpenRouterHeaders(openRouterTracking),
    });

    const result = await generateText({
      model: openrouter.chat(llmModel),
      system: buildMemoryChatSystemPrompt(memoryContext),
      messages: [...history, { role: 'user', content: query }],
      ...(buildOpenRouterProviderOptions(openRouterTracking)
        ? { providerOptions: buildOpenRouterProviderOptions(openRouterTracking) }
        : {}),
    });

    await recordMemoryChatUsage({
      supabase,
      userId: claims.userId,
      userEmail,
      settingsData,
      llmModel,
      llmApiKey,
      usage: result.usage,
    });

    return NextResponse.json({
      answer: result.text,
      sourceEmailIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = resolveMemoryChatErrorStatus(message);

    if (status === 500) {
      console.error('[internal/opencode/memory POST] error:', error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
