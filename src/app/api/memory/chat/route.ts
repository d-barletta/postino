import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest, handleUserError } from '@/lib/api-auth';
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

    type ChatMessage = { role: 'user' | 'assistant'; content: string };
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const MAX_HISTORY = 10;
    const MAX_MESSAGE_LENGTH = 2000;
    const MAX_SEARCH_QUERY_LENGTH = 500;
    const history: ChatMessage[] = rawHistory
      .slice(-MAX_HISTORY)
      .filter(
        (m: unknown): m is ChatMessage =>
          typeof m === 'object' &&
          m !== null &&
          ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string',
      )
      .map((m: ChatMessage) => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }));

    // uid comes from server-side Firebase token verification and cannot be
    // spoofed by the client. The containerTag ensures each search query is
    // restricted to the authenticated user's own memory partition in
    // Supermemory, preventing any cross-user data access.
    const containerTag = `user_${uid}`;
    const client = new Supermemory({ apiKey: memoryApiKey });

    // Build a search query that combines recent conversation context so that
    // follow-up questions retrieve memories relevant to the full dialogue.
    const recentUserMessages = history
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content)
      .join(' ');
    const searchQuery = recentUserMessages ? `${recentUserMessages} ${query}`.slice(0, MAX_SEARCH_QUERY_LENGTH) : query;

    const searchResult = await client.search.memories({
      q: searchQuery,
      containerTag,
      limit: 10,
      include: { documents: true },
    });

    const memories = searchResult.results ?? [];
    const memoryContext =
      memories.length > 0
        ? memories
            .map((r, i) => {
              const text = r.memory;
              return text ? `[${i + 1}] ${text}` : null;
            })
            .filter(Boolean)
            .join('\n\n')
        : '';

    // Extract email IDs from memory metadata (set during add()) or from the
    // associated source documents (returned when include.documents=true), or fall
    // back to parsing the memory text for entries stored before metadata was introduced.
    const emailIdPattern = /^Email ID:\s*(\S+)$/m;
    const sourceEmailIds = [
      ...new Set(
        memories
          .map((r) => {
            // 1. Memory-level metadata
            if (r.metadata && typeof r.metadata.logId === 'string' && r.metadata.logId) {
              return r.metadata.logId;
            }
            // 2. Source document metadata (available when include.documents=true)
            if (Array.isArray(r.documents) && r.documents.length > 0) {
              for (const doc of r.documents) {
                if (
                  doc.metadata &&
                  typeof doc.metadata.logId === 'string' &&
                  doc.metadata.logId
                ) {
                  return doc.metadata.logId as string;
                }
              }
            }
            // 3. Text-based fallback for older entries
            if (!r.memory) return null;
            const m = r.memory.match(emailIdPattern);
            return m ? m[1] : null;
          })
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
      messages: [...history, { role: 'user', content: query }],
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
    return handleUserError(error, 'memory/chat POST');
  }
}
