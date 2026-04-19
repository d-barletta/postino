import {
  SANDBOX_EMAIL_AGENT_PROMPT,
  SANDBOX_EMAIL_AGENT_VERIFICATION_PROMPT,
} from './sandbox-email-agent-prompt';

export type SandboxPromptRule = {
  name: string;
  text: string;
};

export type SandboxPromptSkillName = 'caveman' | 'html-email-editing';

export type SandboxPromptSkillToggles = Partial<Record<SandboxPromptSkillName, boolean>>;

const DEFAULT_SANDBOX_PLATFORM_TIMEOUT_MINUTES = 15;

function sanitizeRule(rule: string): string {
  return rule
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeEmailField(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function populateSandboxPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/__[A-Z0-9_]+__/g, (placeholder) => values[placeholder] ?? placeholder);
}

function isSkillEnabled(
  skillToggles: SandboxPromptSkillToggles | undefined,
  skillName: SandboxPromptSkillName,
): boolean {
  return skillToggles?.[skillName] !== false;
}

function buildRulesText(rules: SandboxPromptRule[]): string {
  return rules.length > 0
    ? rules
        .map((rule) => `Rule "${sanitizeRule(rule.name)}": ${sanitizeRule(rule.text)}`)
        .join('\n')
    : 'No specific rules. Preserve the original email content and subject unless a global system behavior explicitly requires a minimal, non-destructive cleanup.';
}

function buildAttachmentsLine(attachmentNames?: string[]): string {
  return attachmentNames && attachmentNames.length > 0
    ? `\nATTACHMENTS: ${attachmentNames.join(', ')}`
    : '';
}

function buildSkillPromptValues(skillToggles?: SandboxPromptSkillToggles): Record<string, string> {
  const cavemanEnabled = isSkillEnabled(skillToggles, 'caveman');
  const htmlEditingEnabled = isSkillEnabled(skillToggles, 'html-email-editing');

  return {
    __CAVEMAN_IMPORTANT_LINE__: cavemanEnabled
      ? '- Activate the caveman skill in ultra mode immediately by using "/caveman ultra" and keep it active for the entire task to minimize token usage while you work.'
      : '- Caveman skill is disabled. Do not use /caveman or any caveman mode command.',
    __HTML_EDITING_IMPORTANT_LINE__: htmlEditingEnabled
      ? '- html-email-editing skill is enabled. Use it for this task to preserve email HTML structure/styles while making surgical rule-based edits.'
      : '- html-email-editing skill is disabled. Do not use it.',
    __CAVEMAN_STEP_INSTRUCTION__: cavemanEnabled
      ? 'First, activate caveman ultra mode by issuing: /caveman ultra'
      : 'Caveman skill is disabled. Skip any caveman command.',
    __HTML_EDITING_STEP_INSTRUCTION__: htmlEditingEnabled
      ? 'Activate the html-email-editing skill before editing the HTML body.'
      : 'html-email-editing skill is disabled. Skip any html-email-editing activation.',
  };
}

function buildMemoryPromptValues(memoryToolEnabled?: boolean): Record<string, string> {
  return {
    __MEMORY_IMPORTANT_LINE__: memoryToolEnabled
      ? '- A `memory_agent` tool is available. Use it only when prior emails are clearly required to apply a rule. Ask at most one short, focused question (no pasted HTML/email body), do not retry on timeout/errors, and immediately continue without memory if it is slow or unavailable.'
      : '- An <email_history> block may be provided below with prior emails from the same sender. Use it to detect sender-specific patterns when applying the rules.',
    __MEMORY_STEP_INSTRUCTION__: memoryToolEnabled
      ? 'Only if prior emails are clearly required for a rule, call memory_agent once with a short question (never paste full HTML or long excerpts). Treat memory as optional context; if the tool is slow, fails, or times out, skip memory and continue editing immediately.'
      : 'Review the provided <email_history> block if present before editing.',
  };
}

export function buildSandboxEmailAgentPrompt(input: {
  emailFrom: string;
  emailSubject: string;
  rules: SandboxPromptRule[];
  memorySection?: string;
  memoryToolEnabled?: boolean;
  analysisSection?: string;
  skillToggles?: SandboxPromptSkillToggles;
  attachmentNames?: string[];
  sandboxPlatformTimeoutMinutes?: number;
}): string {
  const {
    emailFrom,
    emailSubject,
    rules,
    memorySection = '',
    memoryToolEnabled,
    analysisSection = '',
    skillToggles,
    attachmentNames,
    sandboxPlatformTimeoutMinutes = DEFAULT_SANDBOX_PLATFORM_TIMEOUT_MINUTES,
  } = input;

  return populateSandboxPromptTemplate(SANDBOX_EMAIL_AGENT_PROMPT, {
    __EMAIL_FROM__: sanitizeEmailField(emailFrom),
    __EMAIL_SUBJECT__: sanitizeEmailField(emailSubject),
    __ATTACHMENTS_LINE__: buildAttachmentsLine(attachmentNames),
    __RULES_TEXT__: buildRulesText(rules),
    __SANDBOX_PLATFORM_TIMEOUT_MINUTES__: String(sandboxPlatformTimeoutMinutes),
    __ANALYSIS_SECTION__: analysisSection,
    __MEMORY_SECTION__: memorySection,
    __ORIGINAL_SUBJECT__: sanitizeEmailField(emailSubject),
    ...buildSkillPromptValues(skillToggles),
    ...buildMemoryPromptValues(memoryToolEnabled),
  });
}

export function buildSandboxEmailAgentVerificationPrompt(input: {
  emailFrom: string;
  emailSubject: string;
  rules: SandboxPromptRule[];
  skillToggles?: SandboxPromptSkillToggles;
}): string {
  const { emailFrom, emailSubject, rules, skillToggles } = input;

  return populateSandboxPromptTemplate(SANDBOX_EMAIL_AGENT_VERIFICATION_PROMPT, {
    __EMAIL_FROM__: sanitizeEmailField(emailFrom),
    __EMAIL_SUBJECT__: sanitizeEmailField(emailSubject),
    __RULES_TEXT__: buildRulesText(rules),
    ...buildSkillPromptValues(skillToggles),
  });
}
