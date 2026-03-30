export interface User {
  uid: string;
  email: string;
  assignedEmail: string;
  createdAt: Date;
  isAdmin: boolean;
  isActive: boolean;
  isAddressEnabled?: boolean;
  /** When false, the Postino notification box is not appended to forwarded emails. Defaults to true. */
  isForwardingHeaderEnabled?: boolean;
  displayName?: string;
  /** FCM registration tokens for web push notifications (one per browser/device). */
  fcmTokens?: string[];
  /** Preferred language for AI analysis output (summary, intent, tags, topics). ISO 639-1 code, e.g. "en", "it". When unset, defaults to English. */
  analysisOutputLanguage?: string;
}

export interface Rule {
  id: string;
  userId: string;
  name: string;
  text: string;
  matchSender?: string;
  matchSubject?: string;
  matchBody?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  /** Optional explicit ordering position. Lower values run first. Defaults to creation order. */
  sortOrder?: number;
}

export type EmailStatus = 'received' | 'processing' | 'forwarded' | 'error' | 'skipped';

/**
 * Structured result of the AI pre-analysis pass that runs before rule application.
 * Captures classification, sentiment, intent and enrichment tags for each email.
 */
export interface EmailAnalysis {
  /** Primary category of the email. */
  emailType: 'newsletter' | 'transactional' | 'promotional' | 'personal' | 'notification' | 'automated' | 'other';
  /** 1-2 sentence summary of the email content. */
  summary: string;
  /** Key topics or themes mentioned in the email. */
  topics: string[];
  /** Specific descriptive tags (e.g. company name, product, event type). */
  tags: string[];
  /** True if this email requests or requires action from the recipient. */
  hasActionItems: boolean;
  /** True if this email is explicitly marked as urgent or time-sensitive. */
  isUrgent: boolean;
  /** True if the email explicitly or implicitly expects a direct reply. */
  requiresResponse: boolean;
  /** ISO 639-1 language code of the email body (e.g. "en", "it", "es"). */
  language: string;
  /** Overall emotional tone of the email. */
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Processing priority inferred from content and urgency signals. */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Concise description of the sender's primary intent (e.g. "Confirming order", "Requesting payment"). */
  intent: string;
  /** Characterises who sent the email. */
  senderType: 'human' | 'automated' | 'business' | 'newsletter';
  /** Named entities extracted from the email body. */
  entities: {
    /** Physical or geographic locations mentioned (cities, addresses, venues, countries). */
    places: string[];
    /** Events mentioned (meetings, conferences, deadlines, appointments). */
    events: string[];
    /** Specific dates, times, or time references. */
    dates: string[];
    /** Names of people mentioned. */
    people: string[];
    /** Company, brand, or organization names mentioned. */
    organizations: string[];
  };
}

export interface EmailLog {
  id: string;
  toAddress: string;
  fromAddress: string;
  /** CC recipients from the original email header. */
  ccAddress?: string;
  /** BCC recipients from the original email header. */
  bccAddress?: string;
  subject: string;
  receivedAt: Date;
  processedAt?: Date;
  status: EmailStatus;
  ruleApplied?: string;
  tokensUsed?: number;
  estimatedCost?: number;
  userId: string;
  originalBody?: string;
  processedBody?: string;
  errorMessage?: string;
  /** Number of attachments in the original email. */
  attachmentCount?: number;
  /** Original filenames of attachments in the email. */
  attachmentNames?: string[];
  /** Structured AI pre-analysis of the email stored at processing time. */
  emailAnalysis?: EmailAnalysis;
}

export interface Settings {
  maxRuleLength: number;
  /** Maximum number of active rules a non-admin user can have. Defaults to 3. */
  maxActiveRules?: number;
  llmModel: string;
  llmApiKey: string;
  llmMaxTokens?: number;
  llmSystemPrompt?: string;
  emailSubjectPrefix?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  /** Display name used in the From header of forwarded emails. Supports `{senderName}` placeholder which is replaced with the original sender's display name. */
  smtpFromName?: string;
  /** Email address used in the From header of forwarded emails. Takes precedence over the combined `smtpFrom` field when set. */
  smtpFromEmail?: string;
  emailDomain: string;
  mailgunApiKey: string;
  mailgunWebhookSigningKey?: string;
  /** Enables persistence of detailed inbound Mailgun webhook request logs. */
  mailgunWebhookLoggingEnabled?: boolean;
  mailgunDomain: string;
  mailgunSandboxEmail?: string;
  mailgunBaseUrl?: string;
  maintenanceMode?: boolean;
  /** When enabled, new user registrations are suspended and a maintenance warning is shown on the signup page. */
  signupMaintenanceMode?: boolean;
  /** Controls whether matching rules are applied sequentially (output of N feeds into N+1) or all at once in a single LLM call. Defaults to 'sequential'. */
  rulesExecutionMode?: 'sequential' | 'parallel';
  /** Character threshold above which the agent switches to map-reduce chunked processing. */
  agentChunkThresholdChars?: number;
  /** Target size for each chunk in map-reduce processing. */
  agentChunkSizeChars?: number;
  /** Max output tokens for each chunk extraction call. */
  agentChunkExtractMaxTokens?: number;
  /** Max output tokens for the pre-analysis classification call. */
  agentAnalysisMaxTokens?: number;
  /** Max body characters included in pre-analysis. */
  agentBodyAnalysisMaxChars?: number;
  /** Max raw characters used as fallback when a chunk extraction fails. */
  agentChunkFallbackMaxChars?: number;
  /** Max output tokens for the simplified low-complexity fallback pass. */
  agentFallbackMaxTokens?: number;
  /** Enables/disables collection and persistence of agent execution traces. */
  agentTracingEnabled?: boolean;
  /** Includes prompt/response excerpts in trace payloads when tracing is enabled. */
  agentTraceIncludeExcerpts?: boolean;
  updatedAt?: Date;
}

export interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalEmailsReceived: number;
  totalEmailsForwarded: number;
  totalEmailsError: number;
  totalEmailsSkipped: number;
  totalTokensUsed: number;
  totalEstimatedCost: number;
}

export interface UserStats {
  totalEmailsReceived: number;
  totalEmailsForwarded: number;
  totalEmailsError: number;
  totalEmailsSkipped: number;
  totalTokensUsed: number;
  totalEstimatedCost: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EmailMemoryEntry {
  /** ID of the corresponding emailLog document */
  logId: string;
  /** Date in YYYY-MM-DD format (UTC) */
  date: string;
  /** Full ISO timestamp */
  timestamp: string;
  fromAddress: string;
  subject: string;
  ruleApplied?: string;
  wasSummarized: boolean;
  /** AI-generated 1-2 sentence summary of the email content. */
  summary?: string;
  /** Classified type of the email (newsletter, transactional, promotional, personal, notification, automated, other). */
  emailType?: string;
  /** ISO 639-1 language code detected by pre-analysis. */
  language?: string;
  /** Overall sentiment detected by pre-analysis (positive, neutral, negative). */
  sentiment?: string;
  /** Processing priority inferred from content (low, normal, high, critical). */
  priority?: string;
  /** Descriptive tags detected by pre-analysis. */
  tags?: string[];
  /** Sender's primary intent as detected by pre-analysis. */
  intent?: string;
  /** Characterises who sent the email (human, automated, business, newsletter). */
  senderType?: string;
  /** True if the email explicitly or implicitly expected a direct reply. */
  requiresResponse?: boolean;
  /** Named entities extracted from the email body. */
  entities?: {
    places: string[];
    events: string[];
    dates: string[];
    people: string[];
    organizations: string[];
  };
}

export interface UserMemory {
  userId: string;
  /** Chronologically ordered memory entries (oldest first) */
  entries: EmailMemoryEntry[];
  updatedAt: Date;
}
