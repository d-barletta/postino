import {
  EMAIL_AGENT_ANALYSIS_SYSTEM_PROMPT,
  EMAIL_AGENT_ANALYSIS_PROMPT,
} from './email-agent-prompt';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  nb: 'Norwegian',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
};

function populateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/__[A-Z0-9_]+__/g, (placeholder) => values[placeholder] ?? placeholder);
}

// ---------------------------------------------------------------------------
// Public builder functions
// ---------------------------------------------------------------------------

/**
 * Builds the populated system prompt for the pre-analysis pass.
 *
 * @param outputLanguage — ISO 639-1 language code (e.g. "it", "fr"). When
 *   provided, instructs the model to write certain output fields in that
 *   language. Leave undefined or empty for no language override.
 */
export function buildEmailAgentAnalysisSystemPrompt(outputLanguage?: string): string {
  const langCode = outputLanguage?.toLowerCase().trim();
  const langName = langCode ? (LANGUAGE_NAMES[langCode] ?? langCode) : null;
  const languageInstruction = langName
    ? `LANGUAGE_INSTRUCTION: Write the summary, intent, and topics fields in ${langName}.`
    : '';

  return populateTemplate(EMAIL_AGENT_ANALYSIS_SYSTEM_PROMPT, {
    __LANGUAGE_INSTRUCTION__: languageInstruction,
  });
}

/**
 * Builds the populated user prompt for the pre-analysis pass.
 *
 * @param emailFrom    — Sanitized sender address / display name.
 * @param emailSubject — Sanitized email subject line.
 * @param isHtml       — Whether the body was originally HTML (affects the
 *                       body-format label shown to the model).
 * @param bodyExcerpt  — The (possibly truncated) email body text.
 */
export function buildEmailAgentAnalysisPrompt(
  emailFrom: string,
  emailSubject: string,
  isHtml: boolean,
  bodyExcerpt: string,
): string {
  const bodyLabel = isHtml ? '(Markdown, converted from HTML)' : '(excerpt)';

  return populateTemplate(EMAIL_AGENT_ANALYSIS_PROMPT, {
    __EMAIL_FROM__: emailFrom,
    __EMAIL_SUBJECT__: emailSubject,
    __BODY_LABEL__: bodyLabel,
    __BODY_EXCERPT__: bodyExcerpt,
  });
}
