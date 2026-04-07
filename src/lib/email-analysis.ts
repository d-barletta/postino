import { analyzeEmailContent } from '@/lib/agent';
import type { EmailAnalysis } from '@/types';

interface StoredEmailAnalysisInput {
  fromAddress?: string;
  subject?: string;
  originalBody?: string;
  analysisOutputLanguage?: string;
}

export function toFirestoreSafeAnalysis(analysis: EmailAnalysis): EmailAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as EmailAnalysis;
}

export async function analyzeStoredEmailLog(
  input: StoredEmailAnalysisInput,
): Promise<EmailAnalysis> {
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
    undefined,
    input.analysisOutputLanguage,
  );

  if (!result.analysis) {
    throw new Error('Analysis unavailable');
  }

  return toFirestoreSafeAnalysis(result.analysis);
}
