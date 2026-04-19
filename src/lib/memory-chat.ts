import Supermemory from 'supermemory';
import { createAdminClient } from '@/lib/supabase/admin';
import { addUserCreditsUsage } from '@/lib/credits';
import { getModelPricing, calculateCost } from '@/lib/openrouter';

const MAX_QUERY_LENGTH = 1000;
const MAX_HISTORY = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SEARCH_QUERY_LENGTH = 500;

export interface MemoryChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function resolveMemoryChatErrorStatus(message: string): number {
  if (message === 'Unauthorized') return 401;
  if (message === 'Memory feature is not enabled') return 403;
  if (message === 'Query is required' || message.includes('at most')) return 400;
  return 500;
}

export function resolveMemoryApiKey(settingsApiKey?: string): string {
  return (settingsApiKey || process.env.SUPERMEMORY_API_KEY || '').trim();
}

export function normalizeMemoryChatUsage(
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined,
): { inputTokens: number; outputTokens: number } {
  let inputTokens = usage?.inputTokens ?? 0;
  let outputTokens = usage?.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? 0;

  if (totalTokens > 0 && inputTokens + outputTokens === 0) {
    inputTokens = totalTokens;
  } else if (totalTokens > 0 && inputTokens + outputTokens < totalTokens) {
    const missing = totalTokens - (inputTokens + outputTokens);
    if (inputTokens <= outputTokens) inputTokens += missing;
    else outputTokens += missing;
  }

  return { inputTokens, outputTokens };
}

export function normalizeMemoryChatHistory(rawHistory: unknown): MemoryChatMessage[] {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .slice(-MAX_HISTORY)
    .filter(
      (message: unknown): message is MemoryChatMessage =>
        typeof message === 'object' &&
        message !== null &&
        ((message as MemoryChatMessage).role === 'user' ||
          (message as MemoryChatMessage).role === 'assistant') &&
        typeof (message as MemoryChatMessage).content === 'string',
    )
    .map((message: MemoryChatMessage) => ({
      role: message.role,
      content: String(message.content).slice(0, MAX_MESSAGE_LENGTH),
    }));
}

export function validateMemoryChatQuery(rawQuery: unknown): string {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';

  if (!query) {
    throw new Error('Query is required');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Query must be at most ${MAX_QUERY_LENGTH} characters`);
  }

  return query;
}

export async function getMemoryChatRuntimeConfig(): Promise<{
  supabase: ReturnType<typeof createAdminClient>;
  settingsData: Record<string, unknown>;
  memoryApiKey: string;
  llmApiKey: string;
  llmModel: string;
}> {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settingsData = (settingsRow?.data as Record<string, unknown> | undefined) ?? {};

  if (settingsData.memoryEnabled !== true) {
    throw new Error('Memory feature is not enabled');
  }

  const memoryApiKey = resolveMemoryApiKey(settingsData.memoryApiKey as string | undefined);
  if (!memoryApiKey) {
    throw new Error('Supermemory API key is not configured');
  }

  const llmApiKey =
    (settingsData.llmApiKey as string | undefined) || process.env.OPEN_ROUTER_API_KEY || '';
  const llmModel =
    (settingsData.llmModel as string | undefined)?.trim() || process.env.LLM_MODEL?.trim() || '';

  if (!llmModel) {
    throw new Error('LLM model is not configured. Please set it in Admin → Settings.');
  }

  if (!llmApiKey) {
    throw new Error('LLM API key is not configured');
  }

  return {
    supabase,
    settingsData,
    memoryApiKey,
    llmApiKey,
    llmModel,
  };
}

export async function resolveMemoryChatUserEmail(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  fallbackEmail?: string,
): Promise<string> {
  const normalizedFallback = (fallbackEmail || '').trim();
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const { data: userRow } = await supabase.from('users').select('email').eq('id', userId).single();
  return typeof userRow?.email === 'string' ? userRow.email.trim() : '';
}

export async function searchMemoryChatContext(params: {
  userId: string;
  query: string;
  history: MemoryChatMessage[];
  memoryApiKey: string;
}): Promise<{ memoryContext: string; sourceEmailIds: string[] }> {
  const { userId, query, history, memoryApiKey } = params;

  const recentUserMessages = history
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join(' ');
  const searchQuery = recentUserMessages
    ? `${recentUserMessages} ${query}`.slice(0, MAX_SEARCH_QUERY_LENGTH)
    : query;

  const containerTag = `user_${userId}`;
  const client = new Supermemory({ apiKey: memoryApiKey });
  const searchResult = await client.search.memories({
    q: searchQuery,
    containerTag,
    limit: 10,
    searchMode: 'hybrid',
  });

  const memories = searchResult.results ?? [];

  console.warn(
    '[memory/chat] supermemory raw results:',
    JSON.stringify(
      memories.map((result) => ({
        memory: result.memory,
        chunk: result.chunk,
        metadata: result.metadata,
        documents: result.documents,
        similarity: result.similarity,
      })),
      null,
      2,
    ),
  );

  const memoryContext =
    memories.length > 0
      ? memories
          .map((result, index) => {
            const text = result.memory ?? result.chunk;
            return text ? `[${index + 1}] ${text}` : null;
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

  const emailIdPattern = /\bPostinoEmailID:\s*(\S+)/;
  const extractSourceEmailId = (result: (typeof memories)[number]): string | null => {
    if (result.metadata && typeof result.metadata.logId === 'string' && result.metadata.logId) {
      return result.metadata.logId;
    }

    if (Array.isArray(result.documents) && result.documents.length > 0) {
      for (const document of result.documents) {
        if (
          document.metadata &&
          typeof document.metadata.logId === 'string' &&
          document.metadata.logId
        ) {
          return document.metadata.logId as string;
        }
      }
    }

    const textToSearch = result.chunk ?? result.memory ?? '';
    if (!textToSearch) return null;
    const match = textToSearch.match(emailIdPattern);
    return match ? match[1] : null;
  };

  const sourceEmailIds = Array.from(
    memories.reduce((emailScores, result, index) => {
      const emailId = extractSourceEmailId(result);
      if (!emailId) {
        return emailScores;
      }

      const similarity =
        typeof result.similarity === 'number' && Number.isFinite(result.similarity)
          ? result.similarity
          : Number.NEGATIVE_INFINITY;
      const existing = emailScores.get(emailId);

      if (
        !existing ||
        similarity > existing.similarity ||
        (similarity === existing.similarity && index < existing.index)
      ) {
        emailScores.set(emailId, { similarity, index });
      }

      return emailScores;
    }, new Map<string, { similarity: number; index: number }>()),
  )
    .sort(([, left], [, right]) => right.similarity - left.similarity || left.index - right.index)
    .map(([emailId]) => emailId);

  if (sourceEmailIds.length === 0 && memories.length > 0) {
    console.warn('[memory/chat] no sourceEmailIds resolved — metadata/chunk may be missing logId');
  } else {
    console.warn('[memory/chat] resolved sourceEmailIds:', sourceEmailIds);
  }

  return { memoryContext, sourceEmailIds };
}

export function buildMemoryChatSystemPrompt(memoryContext: string): string {
  return memoryContext
    ? "Your name is Postino, you are a helpful assistant answering questions about the user's email memories. " +
        'Use the memory context provided below together with the conversation history to answer. ' +
        'For follow-up questions, refer to both the memory context and previous exchanges to give accurate, contextual replies. ' +
        'Be concise and helpful. If neither the memory context nor the conversation history contains relevant information, say so clearly.\n\n' +
        `<memory_context>\n${memoryContext}\n</memory_context>`
    : 'Your name is Postino, you are a helpful assistant. The user asked a question about their email memories, ' +
        'but no relevant memories were found. Use the conversation history to answer follow-up questions if applicable, ' +
        'otherwise let them know politely that no relevant memories were found.';
}

export async function recordMemoryChatUsage(params: {
  supabase: ReturnType<typeof createAdminClient>;
  userId: string;
  userEmail: string;
  settingsData: Record<string, unknown>;
  llmModel: string;
  llmApiKey: string;
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
}): Promise<void> {
  const { supabase, userId, userEmail, settingsData, llmModel, llmApiKey, usage } = params;
  const { inputTokens, outputTokens } = normalizeMemoryChatUsage(usage);
  const pricing = await getModelPricing(llmModel, llmApiKey).catch(() => null);
  const cost = calculateCost(inputTokens, outputTokens, pricing);

  const { data: currentUser } = await supabase
    .from('users')
    .select('memory_tokens_used, memory_estimated_cost')
    .eq('id', userId)
    .single();

  await supabase
    .from('users')
    .update({
      memory_tokens_used:
        ((currentUser?.memory_tokens_used as number) ?? 0) + inputTokens + outputTokens,
      memory_estimated_cost: ((currentUser?.memory_estimated_cost as number) ?? 0) + cost,
    })
    .eq('id', userId)
    .then(undefined, (error: unknown) =>
      console.error('[memory/chat] Failed to update memory token stats:', error),
    );

  void addUserCreditsUsage({
    userId,
    userEmail,
    estimatedCostUsd: cost,
    settingsData,
  });
}
