import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyUserRequest } from '@/lib/api-auth';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { searchMemoriesTool } from '@supermemory/tools/ai-sdk';

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

    const llmApiKey = (settingsData?.llmApiKey as string | undefined) || process.env.OPEN_ROUTER_API_KEY || '';
    const llmModel = (settingsData?.llmModel as string | undefined) || process.env.LLM_MODEL || 'openai/gpt-4o-mini';

    if (!llmApiKey) {
      return NextResponse.json({ error: 'LLM API key is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const openrouter = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: llmApiKey,
    });

    const containerTag = `user_${uid}`;
    const searchTool = searchMemoriesTool(memoryApiKey, { containerTags: [containerTag] });

    const result = await generateText({
      model: openrouter(llmModel),
      system:
        'You are a helpful assistant with access to the user\'s email memories. ' +
        'Use the search_memories tool to find relevant information about the user\'s emails, ' +
        'then answer their question based on what you find. ' +
        'Be concise and helpful. If no relevant memories are found, say so clearly.',
      messages: [{ role: 'user', content: query }],
      tools: { search_memories: searchTool },
      maxSteps: 3,
    });

    return NextResponse.json({ answer: result.text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    if (status === 500) console.error('[memory/chat] POST error:', error);
    return NextResponse.json({ error: msg }, { status });
  }
}
