/**
 * agent.ts — Re-export shim for backward compatibility.
 *
 * The agent implementation has moved to `src/agents/email-agent.ts`.
 * This file re-exports all public symbols so existing import paths continue to work.
 */

export {
  processEmailWithAgent,
  getUserMemory,
  saveUserMemory,
  compactMemory,
  buildMemoryContext,
} from '@/agents/email-agent';
