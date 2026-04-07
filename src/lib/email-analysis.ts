import { analyzeEmailContent } from '@/lib/agent';
import type { EmailAnalysis } from '@/types';

interface StoredEmailAnalysisInput {
  fromAddress?: string;
  subject?: string;
  originalBody?: string;
  analysisOutputLanguage?: string;
  modelOverride?: string;
}

export interface StoredEmailAnalysisDebugResult {
  analysis: EmailAnalysis | null;
  extractedBody: string;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export function toFirestoreSafeAnalysis(analysis: EmailAnalysis): EmailAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as EmailAnalysis;
}

export async function analyzeStoredEmailLogWithDebug(
  input: StoredEmailAnalysisInput,
): Promise<StoredEmailAnalysisDebugResult> {
  const originalBody = typeof input.originalBody === 'string' ? input.originalBody : '';
  if (!originalBody.trim()) {
    throw new Error('Original email content unavailable');
  }

  const emailFrom = typeof input.fromAddress === 'string' ? input.fromAddress : '';
  const emailSubject = typeof input.subject === 'string' ? input.subject : '';
  const isHtml = /<[a-z][\s\S]*>/i.test(originalBody);

  const result = await analyzeEmailContent(
    emailFrom,
    emailSubject,
    originalBody,
    isHtml,
    input.modelOverride,
    input.analysisOutputLanguage,
  );

  return {
    analysis: result.analysis ? toFirestoreSafeAnalysis(result.analysis) : null,
    extractedBody: result.extractedBody,
    tokensUsed: result.tokensUsed,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  };
}

export async function analyzeStoredEmailLog(
  input: StoredEmailAnalysisInput,
): Promise<EmailAnalysis> {
  const result = await analyzeStoredEmailLogWithDebug(input);

  if (!result.analysis) {
    throw new Error('Analysis unavailable');
  }

  return result.analysis;
}
