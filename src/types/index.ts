export interface BlogArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  thumbnailUrl?: string;
  published: boolean;
  /** ISO 639-1 locale code for this article version, e.g. "en", "it". */
  language: string;
  /** Groups all language versions of the same article together. */
  translationGroupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  uid: string;
  email: string;
  assignedEmail: string;
  createdAt: Date;
  isAdmin: boolean;
  isActive: boolean;
  isAddressEnabled?: boolean;
  /** When true and isAddressEnabled is false, incoming emails are still analysed by AI and saved to memory, but rules and forwarding are skipped. */
  isAiAnalysisOnlyEnabled?: boolean;
  /** When false, the Postino notification box is not appended to forwarded emails. Defaults to true. */
  isForwardingHeaderEnabled?: boolean;
  displayName?: string;
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

export interface EmailAnalysisPlace {
  name: string;
  latitude: number;
  longitude: number;
  displayName?: string;
}

/**
 * Structured result of the AI pre-analysis pass that runs before rule application.
 * Captures classification, sentiment, intent and enrichment tags for each email.
 */
export interface EmailAnalysis {
  /** Primary category of the email. */
  emailType:
    | 'newsletter'
    | 'transactional'
    | 'promotional'
    | 'personal'
    | 'notification'
    | 'automated'
    | 'other';
  /** 1-2 sentence summary of the email content. */
  summary: string;
  /** Key topics or themes mentioned in the email. */
  topics: string[];
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
    /** Physical or geographic locations mentioned, geocoded and stored with coordinates. */
    places: EmailAnalysisPlace[];
    /** Denormalized place names used for search/filter queries. */
    placeNames: string[];
    /** Events mentioned (meetings, conferences, deadlines, appointments). */
    events: string[];
    /** Specific dates, times, or time references. */
    dates: string[];
    /** Names of people mentioned. */
    people: string[];
    /** Company, brand, or organization names mentioned. */
    organizations: string[];
    /** Labelled numeric codes and identifiers (phone numbers, card numbers, client IDs, etc.).
     *  Each entry is formatted as "<label> <number>" (e.g. "codice carta 134533"). */
    numbers: string[];
  };
  /** Prices, costs, or monetary amounts mentioned in the email (e.g. "$19.99/month", "€50 discount"). */
  prices?: string[];
}

export interface EmailAttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  canDownload: boolean;
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
  /** Download metadata for attachments when loaded in a detail view. */
  attachments?: EmailAttachmentInfo[];
  /** Structured AI pre-analysis of the email stored at processing time. */
  emailAnalysis?: EmailAnalysis;
  /** Whether the email has been read by the user. False means unread; null/undefined means read (legacy rows). */
  isRead?: boolean;
}

export interface LogsResponse {
  logs: EmailLog[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalCount?: number;
  totalPages?: number;
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
  /** Enables the Supermemory.ai integration for persistent memory and the Memory tab. */
  memoryEnabled?: boolean;
  /** Supermemory.ai API key. Falls back to SUPERMEMORY_API_KEY env variable. */
  memoryApiKey?: string;
  /** Google Maps Geocoding API key. When set, place geocoding uses Google Maps instead of Nominatim. Falls back to GOOGLE_MAPS_API_KEY env variable. */
  googleMapsApiKey?: string;
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
  /** Key topics or themes extracted from the email body. */
  topics?: string[];
  /** Sender's primary intent as detected by pre-analysis. */
  intent?: string;
  /** Characterises who sent the email (human, automated, business, newsletter). */
  senderType?: string;
  /** True if the email explicitly or implicitly expected a direct reply. */
  requiresResponse?: boolean;
  /** Prices, costs, or monetary amounts mentioned in the email. */
  prices?: string[];
  /** Names of files attached to the email. */
  attachmentNames?: string[];
  /** Named entities extracted from the email body. */
  entities?: {
    places: string[];
    events: string[];
    dates: string[];
    people: string[];
    organizations: string[];
    /** Labelled numeric codes and identifiers (e.g. "codice carta 134533"). */
    numbers?: string[];
  };
}

export interface UserMemory {
  userId: string;
  /** Chronologically ordered memory entries (oldest first) */
  entries: EmailMemoryEntry[];
  updatedAt: Date;
}

/** Category of an entity that can be merged. */
export type EntityCategory =
  | 'topics'
  | 'people'
  | 'organizations'
  | 'places'
  | 'events'
  | 'dates'
  | 'numbers'
  | 'prices';

/** Category used for entity graph nodes (same values as EntityCategory). */
export type EntityGraphNodeCategory = EntityCategory;

/** A node in the entity relation graph. */
export interface EntityGraphNode {
  id: string;
  label: string;
  category: EntityGraphNodeCategory;
  count: number;
}

/** An edge connecting two nodes in the entity relation graph. */
export interface EntityGraphEdge {
  id: string;
  source: string;
  target: string;
  /** Number of emails in which both endpoints co-occurred. */
  weight: number;
}

/** Full entity relation graph computed from email analysis data. */
export interface EntityRelationGraph {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  /** ISO date string of when the graph was last generated. */
  generatedAt: string;
  totalEmails: number;
}

/** A node in the date-based entity flow graph. */
export interface FlowGraphNode {
  id: string;
  label: string;
  category: EntityGraphNodeCategory;
  /** Number of emails in this bucket that contain the entity. */
  count: number;
  /** 0 = earliest displayed bucket, increasing toward the most recent bucket. */
  bucketIndex: number;
  /** Human-readable label for the bucket, e.g. "Mar 2025". */
  bucketLabel: string;
}

/** Time bucket metadata in the flow graph. */
export interface FlowGraphBucket {
  index: number;
  label: string;
  /** ISO date of the bucket start. */
  startDate: string;
}

/** Date-ordered entity flow graph built from per-bucket entity relationships. */
export interface EntityFlowGraph {
  nodes: FlowGraphNode[];
  edges: EntityGraphEdge[];
  buckets: FlowGraphBucket[];
  /** ISO date string of when the graph was last generated. */
  generatedAt: string;
  totalEmails: number;
}

/** A geocoded place pin shown on the relations map. */
export interface EntityPlaceMapPin {
  id: string;
  label: string;
  category: 'places';
  count: number;
  latitude: number;
  longitude: number;
  displayName?: string;
}

/** Real-map view of the places extracted from analyzed emails. */
export interface EntityPlaceMap {
  pins: EntityPlaceMapPin[];
  /** ISO date string of when the map was last generated. */
  generatedAt: string;
  totalEmails: number;
}

/**
 * Represents a user-defined merge of two or more entity values into a single
 * canonical name.  All `aliases` (including the canonical itself) are treated
 * as equivalent when aggregating knowledge data.
 */
export interface EntityMerge {
  id: string;
  userId: string;
  /** Category of entities being merged. */
  category: EntityCategory;
  /** The canonical name to display instead of the individual aliases. */
  canonical: string;
  /** All original values that map to this canonical (at least two). */
  aliases: string[];
  createdAt: Date;
}

/**
 * An AI-generated suggestion to merge two or more entity values.
 * The user can accept (which opens the merge dialog) or reject the suggestion.
 */
export interface EntityMergeSuggestion {
  id: string;
  userId: string;
  /** Category of entities to be merged. */
  category: EntityCategory;
  /** Suggested canonical name (the representative name). */
  suggestedCanonical: string;
  /** All entity values that the AI suggests merging together (at least two). */
  aliases: string[];
  /** AI-provided rationale for the suggestion. */
  reason: string;
  /** Current status of this suggestion. */
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}
