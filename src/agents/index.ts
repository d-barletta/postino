/**
 * agents/index.ts — Public API of the agents module.
 *
 * Re-exports public agent helpers and the OpenCode processing entrypoint so
 * consumers can import from `@/agents` instead of individual files.
 */

export {
  buildMemoryEntryFromAnalysis,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
} from './email-agent';

export { processEmailWithAgent } from './sandbox-email-agent';
