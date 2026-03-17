export interface User {
  uid: string;
  email: string;
  assignedEmail: string;
  createdAt: Date;
  isAdmin: boolean;
  isActive: boolean;
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
}

export type EmailStatus = 'received' | 'processing' | 'forwarded' | 'error';

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
  llmSystemPrompt?: string;
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
  updatedAt?: Date;
}

export interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalEmailsReceived: number;
  totalEmailsForwarded: number;
  totalEmailsError: number;
  totalTokensUsed: number;
  totalEstimatedCost: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
