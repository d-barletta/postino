import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest } from '@/lib/api-auth';
import { getModelPricing, calculateCost } from '@/lib/openrouter';
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
      return NextResponse.json({ error: 'Supermemory API key is not configured' }, { status: 500 });
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

    const MAX_QUERY_LENGTH = 1000;
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Query must be at most ${MAX_QUERY_LENGTH} characters` },
        { status: 400 },
      );
    }

    // uid comes from server-side Firebase token verification and cannot be
    // spoofed by the client. The containerTag ensures each search query is
    // restricted to the authenticated user's own memory partition in
    // Supermemory, preventing any cross-user data access.
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

    // Extract email IDs from relevant chunks for source-email links in the UI.
    const emailIdPattern = /^Email ID:\s*(\S+)$/m;
    const sourceEmailIds = [
      ...new Set(
        memories
          .flatMap((r) =>
            r.chunks
              .filter((c) => c.isRelevant)
              .map((c) => {
                const m = c.content.match(emailIdPattern);
                return m ? m[1] : null;
              }),
          )
          .filter((id): id is string => id !== null),
      ),
    ];

    const systemPrompt = memoryContext
      ? "Your name is Postino, you are a helpful assistant answering questions about the user's email memories. " +
        'Use only the memory context provided below to answer. ' +
        'Be concise and helpful. If the context does not contain relevant information, say so clearly.\n\n' +
        `<memory_context>\n${memoryContext}\n</memory_context>`
      : 'Your name is Postino, you are a helpful assistant. The user asked a question about their email memories, ' +
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

    // Track token usage on the user document (fire-and-forget).
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    const pricing = await getModelPricing(llmModel, llmApiKey).catch(() => null);
    const cost = calculateCost(inputTokens, outputTokens, pricing);
    db.collection('users')
      .doc(uid)
      .update({
        memoryTokensUsed: FieldValue.increment(inputTokens + outputTokens),
        memoryEstimatedCost: FieldValue.increment(cost),
      })
      .catch((err) => console.error('[memory/chat] Failed to update memory token stats:', err));

    return NextResponse.json({ answer: result.text, sourceEmailIds });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[memory/chat] POST error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
