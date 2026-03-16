import OpenAI from 'openai';
import { adminDb } from './firebase-admin';

export interface ProcessEmailResult {
  subject: string;
  body: string;
  tokensUsed: number;
  estimatedCost: number;
  ruleApplied: string;
}

export async function getOpenRouterClient(): Promise<{ client: OpenAI; model: string; apiKey: string }> {
  const db = adminDb();
  const settingsSnap = await db.collection('settings').doc('global').get();
  const settings = settingsSnap.data();

  const apiKey =
    settings?.llmApiKey ||
    process.env.OPEN_ROUTER_API_KEY ||
    '';
  const model = settings?.llmModel || process.env.LLM_MODEL || 'openai/gpt-4o-mini';
  const normalizedApiKey = apiKey.trim();

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: normalizedApiKey,
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://postino.app',
      'X-Title': 'Postino Email Redirector',
    },
  });

  return { client, model, apiKey: normalizedApiKey };
}

const DEFAULT_SYSTEM_PROMPT = `You are Postino, an intelligent email processing assistant. Your job is to process incoming emails according to user-defined rules and return a processed version.

Instructions:
- Apply the user's rules to transform the email content
- Return the processed email in the exact JSON format specified
- If a rule says to summarize, create a clear summary
- If a rule says to remove ads/promotional content, strip that content
- If no rules match the email content, still process it helpfully
- Keep the subject relevant to the processed content
- Preserve important information while applying the rules`;

export async function processEmailWithRules(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  rules: string[]
): Promise<ProcessEmailResult> {
  const { client, model, apiKey } = await getOpenRouterClient();

  if (!apiKey) {
    throw new Error('Missing OpenRouter API key');
  }

  const db = adminDb();
  const settingsSnap = await db.collection('settings').doc('global').get();
  const settings = settingsSnap.data();
  const basePrompt = (typeof settings?.llmSystemPrompt === 'string' && settings.llmSystemPrompt.trim())
    ? settings.llmSystemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  const activeRules = rules.filter((r) => r.trim().length > 0);
  const rulesText = activeRules.length > 0
    ? activeRules.map((r, i) => `Rule ${i + 1}: ${r}`).join('\n')
    : 'No specific rules. Forward the email as-is with a brief summary prepended.';

  const systemPrompt = `${basePrompt}

User Rules:
${rulesText}`;

  const userPrompt = `Process this incoming email:

FROM: ${emailFrom}
SUBJECT: ${emailSubject}

BODY:
${emailBody}

Return a JSON object with exactly these fields:
{
  "subject": "processed subject line",
  "body": "processed email body in HTML format",
  "ruleApplied": "description of which rule was applied or 'forwarded as-is'"
}`;

  let response;

  try {
    response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OpenRouter error';
    throw new Error(`OpenRouter request failed: ${message}`);
  }

  const content = response.choices[0]?.message?.content || '{}';
  let parsed: { subject?: string; body?: string; ruleApplied?: string };

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      subject: `[Postino] ${emailSubject}`,
      body: `<p>Original email from ${emailFrom}:</p><pre>${emailBody}</pre>`,
      ruleApplied: 'error parsing LLM response, forwarded as-is',
    };
  }

  const tokensUsed = response.usage?.total_tokens || 0;
  // Approximate cost at $0.30/M tokens (gpt-4o-mini rate); actual cost varies by model
  const estimatedCost = (tokensUsed / 1_000_000) * 0.30;

  return {
    subject: parsed.subject || `[Postino] ${emailSubject}`,
    body: parsed.body || emailBody,
    tokensUsed,
    estimatedCost,
    ruleApplied: parsed.ruleApplied || 'unknown',
  };
}
