/**
 * agents/index.ts — Public API of the agents module.
 *
 * Re-exports all public functions and types from the email agent so that
 * consumers can import from `@/agents` instead of the individual files.
 */

export {
  processEmailWithAgent,
  getUserMemory,
  saveUserMemory,
  compactMemory,
  buildMemoryContext,
} from './email-agent';
