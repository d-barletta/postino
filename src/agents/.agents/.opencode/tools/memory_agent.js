import { tool } from '@opencode-ai/plugin';

const MAX_TOOL_RESPONSE_LENGTH = 6000;
const MEMORY_TOOL_TIMEOUT_MS = 12000;
const MAX_MEMORY_TOOL_CALLS = 1;
const MAX_MEMORY_QUERY_LENGTH = 300;

let memoryToolCallCount = 0;
const memoryToolResponseCache = new Map();

function trimToolResponse(value) {
  return typeof value === 'string' ? value.slice(0, MAX_TOOL_RESPONSE_LENGTH) : '';
}

function normalizeQuery(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export default tool({
  description:
    "Ask Postino's memory agent one narrow question about the current user's email memory only when prior emails, sender history, or stored user preferences are genuinely needed to apply the Postino user's rules. Do not use it for broad memory dumps, analysis of the current email, or repeated retries.",
  args: {
    query: tool.schema
      .string()
      .min(1)
      .max(MAX_MEMORY_QUERY_LENGTH)
      .describe(
        'One short, specific question (max 300 chars) about prior emails, sender patterns, or stored user preferences relevant to this edit. Ask a single narrow question. Do not paste HTML, full email bodies, long excerpts, or multiple questions.',
      ),
  },
  async execute(args) {
    const query = normalizeQuery(args.query);
    const baseUrl = (process.env.POSTINO_INTERNAL_BASE_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.POSTINO_MEMORY_TOOL_TOKEN || '').trim();

    if (!baseUrl || !token) {
      return 'Memory tool unavailable for this sandbox run. Continue without memory.';
    }

    if (!query) {
      return 'Memory tool requires one non-empty question.';
    }
    if (query.length > MAX_MEMORY_QUERY_LENGTH) {
      return 'Memory tool question too long. Keep it to 300 characters or fewer.';
    }

    if (memoryToolResponseCache.has(query)) {
      return memoryToolResponseCache.get(query);
    }

    if (memoryToolCallCount >= MAX_MEMORY_TOOL_CALLS) {
      return 'Memory tool limit reached for this run. Use the answer you already have, or continue without additional memory lookups.';
    }

    memoryToolCallCount += 1;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MEMORY_TOOL_TIMEOUT_MS);

    let toolResponse;

    try {
      const response = await fetch(`${baseUrl}/api/internal/opencode/memory`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toolResponse = trimToolResponse(
          `Memory tool failed (${response.status}): ${typeof payload.error === 'string' ? payload.error : 'Unknown error'}`,
        );
      } else {
        const answer = typeof payload.answer === 'string' ? payload.answer.trim() : '';
        const sourceEmailIds = Array.isArray(payload.sourceEmailIds)
          ? payload.sourceEmailIds.filter((value) => typeof value === 'string')
          : [];

        if (!answer && sourceEmailIds.length === 0) {
          toolResponse =
            'Memory tool returned no relevant answer. Continue without memory unless a rule truly requires it.';
        } else {
          const suffix =
            sourceEmailIds.length > 0 ? `\n\nSource email IDs: ${sourceEmailIds.join(', ')}` : '';

          toolResponse = trimToolResponse(`${answer}${suffix}`.trim());
        }
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.name === 'AbortError') {
        toolResponse =
          'Memory tool timed out. Continue without memory if the edit can still be completed safely.';
      } else {
        toolResponse = trimToolResponse(
          `Memory tool unavailable: ${error instanceof Error ? error.message : 'Network error'}`,
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    memoryToolResponseCache.set(query, toolResponse);
    return toolResponse;
  },
});
