import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest } from '@/lib/api-auth';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import Supermemory from 'supermemory';

function resolveMemoryApiKey(settingsApiKey?: string): string {
  return (settingsApiKey || process.env.SUPERMEMORY_API_KEY || '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyUserRequest(request);

    // Check if memory is enabled and get the API key from admin settings
    const db = adminDb();
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settingsData = settingsSnap.data();

    if (!settingsData?.memoryEnabled) {
      return NextResponse.json({ error: 'Memory feature is not enabled' }, { status: 403 });
    }

    const memoryApiKey = resolveMemoryApiKey(settingsData?.memoryApiKey as string | undefined);
    if (!memoryApiKey) {
      return NextResponse.json(
        { error: 'Supermemory API key is not configured' },
        { status: 500 },
      );
    }

    const llmApiKey =
      (settingsData?.llmApiKey as string | undefined) || process.env.OPEN_ROUTER_API_KEY || '';
    const llmModel =
      (settingsData?.llmModel as string | undefined) ||
      process.env.LLM_MODEL ||
      'openai/gpt-4o-mini';

    if (!llmApiKey) {
      return NextResponse.json({ error: 'LLM API key is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Search user's memories directly via the Supermemory client
    const containerTag = `user_${uid}`;
    const client = new Supermemory({ apiKey: memoryApiKey });
    const searchResult = await client.search.execute({
      q: query,
      containerTags: [containerTag],
      limit: 10,
    });

    const memories = searchResult.results ?? [];
    const memoryContext =
      memories.length > 0
        ? memories
            .map((r, i) => {
              const chunkTexts = r.chunks
                .filter((c) => c.isRelevant)
                .map((c) => c.content)
                .join(' ');
              return chunkTexts ? `[${i + 1}] ${chunkTexts}` : null;
            })
            .filter(Boolean)
            .join('\n\n')
        : '';

    const systemPrompt = memoryContext
      ? 'You are a helpful assistant answering questions about the user\'s email memories. ' +
        'Use only the memory context provided below to answer. ' +
        'Be concise and helpful. If the context does not contain relevant information, say so clearly.\n\n' +
        `<memory_context>\n${memoryContext}\n</memory_context>`
      : 'You are a helpful assistant. The user asked a question about their email memories, ' +
        'but no relevant memories were found. Let them know politely.';

    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: llmApiKey,
    });

    const result = await generateText({
      model: openrouter(llmModel),
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    });

    return NextResponse.json({ answer: result.text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[memory/chat] POST error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
