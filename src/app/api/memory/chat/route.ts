import { NextRequest, NextResponse } from 'next/server';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
import { buildOpenRouterHeaders, buildOpenRouterProviderOptions } from '@/lib/openrouter';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import {
  buildMemoryChatSystemPrompt,
  getMemoryChatRuntimeConfig,
  normalizeMemoryChatHistory,
  recordMemoryChatUsage,
  resolveMemoryChatErrorStatus,
  searchMemoryChatContext,
  validateMemoryChatQuery,
} from '@/lib/memory-chat';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUserRequest(request);
    const uid = user.id;
    const { supabase, settingsData, memoryApiKey, llmApiKey, llmModel } =
      await getMemoryChatRuntimeConfig();

    const body = await request.json();
    const query = validateMemoryChatQuery(body.query);
    const requestSessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const openRouterTracking = {
      userId: user.email ?? '',
      sessionId: requestSessionId || `memory-chat:${uid}`,
    };
    const history = normalizeMemoryChatHistory(body.history);
    const { memoryContext, sourceEmailIds } = await searchMemoryChatContext({
      userId: uid,
      query,
      history,
      memoryApiKey,
    });

    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: llmApiKey,
      headers: buildOpenRouterHeaders(openRouterTracking),
    });

    const result = streamText({
      model: openrouter.chat(llmModel),
      system: buildMemoryChatSystemPrompt(memoryContext),
      messages: [...history, { role: 'user', content: query }],
      ...(buildOpenRouterProviderOptions(openRouterTracking)
        ? { providerOptions: buildOpenRouterProviderOptions(openRouterTracking) }
        : {}),
      onFinish: async ({ usage }) => {
        await recordMemoryChatUsage({
          supabase,
          userId: uid,
          userEmail: user.email || '',
          settingsData,
          llmModel,
          llmApiKey,
          usage,
        });
      },
    });

    // Source email IDs are known before the stream starts; send them as a
    // response header so the client can read them immediately.
    return result.toTextStreamResponse({
      headers: {
        'X-Source-Email-Ids': JSON.stringify(sourceEmailIds),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      const status = resolveMemoryChatErrorStatus(error.message);
      if (status !== 500) {
        return NextResponse.json({ error: error.message }, { status });
      }
    }

    return handleUserError(error, 'memory/chat POST');
  }
}
