export interface User {
  uid: string;
  email: string;
  assignedEmail: string;
  createdAt: Date;
  isAdmin: boolean;
  isActive: boolean;
  isAddressEnabled?: boolean;
  displayName?: string;
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

export interface EmailLog {
  id: string;
  toAddress: string;
  fromAddress: string;
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
}

export interface Settings {
  maxRuleLength: number;
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
  emailDomain: string;
  mailgunApiKey: string;
  mailgunWebhookSigningKey?: string;
  mailgunDomain: string;
  mailgunSandboxEmail?: string;
  mailgunBaseUrl?: string;
  maintenanceMode?: boolean;
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
}

export interface UserMemory {
  userId: string;
  /** Chronologically ordered memory entries (oldest first) */
  entries: EmailMemoryEntry[];
  updatedAt: Date;
}
