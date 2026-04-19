import { tool } from '@opencode-ai/plugin';

const MAX_TOOL_RESPONSE_LENGTH = 6000;

function trimToolResponse(value) {
  return typeof value === 'string' ? value.slice(0, MAX_TOOL_RESPONSE_LENGTH) : '';
}

export default tool({
  description:
    "Ask Postino's memory agent a focused question about the current user's email memory. Use this when past emails or sender history would help you apply the rules.",
  args: {
    query: tool.schema
      .string()
      .min(1)
      .max(1000)
      .describe(
        'A focused question about prior emails, sender behavior, or user memory. Ask narrow questions, not broad memory dumps.',
      ),
  },
  async execute(args) {
    const baseUrl = (process.env.POSTINO_INTERNAL_BASE_URL || '').trim().replace(/\/$/, '');
    const token = (process.env.POSTINO_MEMORY_TOOL_TOKEN || '').trim();

    if (!baseUrl || !token) {
      return 'Memory tool unavailable for this sandbox run.';
    }

    const response = await fetch(`${baseUrl}/api/internal/opencode/memory`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: args.query }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return trimToolResponse(
        `Memory tool failed (${response.status}): ${typeof payload.error === 'string' ? payload.error : 'Unknown error'}`,
      );
    }

    const answer = typeof payload.answer === 'string' ? payload.answer.trim() : '';
    const sourceEmailIds = Array.isArray(payload.sourceEmailIds)
      ? payload.sourceEmailIds.filter((value) => typeof value === 'string')
      : [];

    if (!answer && sourceEmailIds.length === 0) {
      return 'Memory tool returned no answer.';
    }

    const suffix =
      sourceEmailIds.length > 0 ? `\n\nSource email IDs: ${sourceEmailIds.join(', ')}` : '';

    return trimToolResponse(`${answer}${suffix}`.trim());
  },
});
