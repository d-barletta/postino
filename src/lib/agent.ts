/**
 * agent.ts — Re-export shim for backward compatibility.
 *
 * Keep existing imports working while routing processing to the OpenCode sandbox agent.
 */

export {
  analyzeEmailContent,
  buildMemoryEntryFromAnalysis,
  saveToSupermemory,
  saveAttachmentFilesToSupermemory,
} from '@/agents/email-agent';

export { processEmailWithAgent } from '@/agents/sandbox-email-agent';
