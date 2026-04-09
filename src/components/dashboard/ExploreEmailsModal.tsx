'use client';

import { toast } from 'sonner';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { formatDate, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useModalHistory } from '@/hooks/useModalHistory';
import { SafeEmailIframe } from '@/components/ui/SafeEmailIframe';
import { Mail, Paperclip, ExternalLink, AlignLeft, Brain, RefreshCw } from 'lucide-react';
import type { EmailAnalysis, EmailLog } from '@/types';
import { AttachmentList } from '@/components/dashboard/AttachmentList';
import { EmailAnalysisTabContent } from '@/components/dashboard/EmailAnalysisTabContent';
import { ResultsPagination } from '@/components/dashboard/ResultsPagination';

const PAGE_SIZE = 20;

const DEFAULT_BADGE_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: DEFAULT_BADGE_COLOR,
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  newsletter: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  transactional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  promotional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  personal: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  notification: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  automated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  other: DEFAULT_BADGE_COLOR,
};

interface ExpandedEmailData {
  originalBody: string | null;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  attachmentCount: number;
  attachmentNames: string[];
  loading: boolean;
  error?: string;
}

interface LogsResponse {
  logs: EmailLog[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalCount?: number;
  totalPages?: number;
}

export interface ExploreEmailsModalProps {
  /** The term to search for (chip value). Null means the modal is closed (in term mode). */
  term: string | null;
  /** Category key: 'tags' | 'topics' | 'people' | 'organizations' | 'places' | 'events' */
  category: string;
  /** Human-readable label shown in the modal header */
  categoryLabel: string;
  onClose: () => void;
  /** Called when user requests fullscreen view of an email */
  onRequestFullscreen: (email: { subject: string; body: string }) => void;
  /**
   * Optional list of alias values that the term was merged from.
   * When provided, the search will match any of these aliases instead of the term alone.
   */
  aliases?: string[];
  /**
   * When provided, the modal shows these specific emails by ID instead of
   * searching by term. The modal is open when this array is non-empty and term is null.
   */
  logIds?: string[];
  /** Title shown in the modal header when in logIds mode. */
  sourceTitle?: string;
}

function EmailRowSkeleton() {
  return (
    <div className="px-6 py-4 animate-pulse">
      <div className="flex items-start gap-2">
        <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="flex gap-1.5">
            <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-10 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    </div>
  );
}

export function ExploreEmailsModal({
  term,
  category,
  categoryLabel,
  onClose,
  onRequestFullscreen,
  aliases,
  logIds,
  sourceTitle,
}: ExploreEmailsModalProps) {
  const { t, locale } = useI18n();
  const { firebaseUser, user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const ts = t.dashboard.search;
  const tk = t.dashboard.knowledge;

  const isLogIdsMode = !term && !!logIds && logIds.length > 0;
  const isOpen = !!term || isLogIdsMode;

  // Integrate with browser history so the Back button closes this modal.
  useModalHistory(isOpen, onClose);

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const [activeDetailTab, setActiveDetailTab] = useState<string>('content');

  const handleAnalysisUpdated = useCallback((emailId: string, analysis: EmailAnalysis) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === emailId ? { ...log, emailAnalysis: analysis } : log)),
    );
  }, []);

  const fetchedExpandedIds = useRef<Set<string>>(new Set());

  const statusLabel: Record<string, string> = {
    received: t.dashboard.charts.received,
    processing: t.dashboard.charts.processing,
    forwarded: t.dashboard.charts.forwarded,
    error: t.dashboard.charts.error,
    skipped: t.dashboard.charts.skipped,
  };

  const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
    received: 'info',
    processing: 'warning',
    forwarded: 'success',
    error: 'error',
    skipped: 'default',
  };

  const rowTypeLabel: Record<string, string> = {
    newsletter: ts.typeNewsletter,
    transactional: ts.typeTransactional,
    promotional: ts.typePromotional,
    personal: ts.typePersonal,
    notification: ts.typeNotification,
    automated: ts.typeAutomated,
    other: ts.typeOther,
  };
  const rowSentimentLabel: Record<string, string> = {
    positive: ts.sentimentPositive,
    neutral: ts.sentimentNeutral,
    negative: ts.sentimentNegative,
  };
  const rowPriorityLabel: Record<string, string> = {
    low: ts.priorityLow,
    normal: ts.priorityNormal,
    high: ts.priorityHigh,
    critical: ts.priorityCritical,
  };

  const fetchLogs = useCallback(
    async (targetPage: number) => {
      if (!firebaseUser || !term) return;
      setLoading(true);
      setTotalCount(undefined);
      try {
        const token = await firebaseUser.getIdToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        // When aliases are provided (merged entity), use OR-matched terms search.
        // Otherwise use tags param for the tags category, or plain text search.
        if (aliases && aliases.length > 0) {
          for (const alias of aliases) {
            params.append('terms', alias.trim());
          }
        } else if (category === 'tags') {
          params.set('tags', term.trim().toLowerCase());
        } else {
          params.set('search', term.trim());
        }
        const res = await fetch(`/api/email/logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: LogsResponse = await res.json();
          setLogs(data.logs ?? []);
          setPage(data.page);
          setHasNextPage(data.hasNextPage);
          setTotalPages(data.totalPages);
          setTotalCount(data.totalCount);
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLoading(false);
      }
    },
    [firebaseUser, term, category, aliases],
  );

  const fetchLogsByIds = useCallback(
    async (ids: string[]) => {
      if (!firebaseUser || ids.length === 0) return;
      setLoading(true);
      setTotalCount(undefined);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/email/by-ids', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });
        if (res.ok) {
          const data: { logs: EmailLog[] } = await res.json();
          setLogs(data.logs ?? []);
          setHasNextPage(false);
          setTotalPages(1);
          setTotalCount(data.logs?.length ?? 0);
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLoading(false);
      }
    },
    [firebaseUser],
  );

  // Reset + fetch when modal opens (term changes)
  useEffect(() => {
    if (!term) return;
    setLogs([]);
    setPage(1);
    setSelectedId(null);
    setExpandedData({});
    fetchedExpandedIds.current = new Set();
    fetchLogs(1);
  }, [term, fetchLogs]);

  // Reset + fetch when logIds mode opens
  useEffect(() => {
    if (!isLogIdsMode || !logIds) return;
    setLogs([]);
    setPage(1);
    setSelectedId(null);
    setExpandedData({});
    fetchedExpandedIds.current = new Set();
    fetchLogsByIds(logIds);
  }, [isLogIdsMode, logIds, fetchLogsByIds]);

  const fetchExpandedEmail = useCallback(
    async (logId: string) => {
      if (!firebaseUser) return;
      if (fetchedExpandedIds.current.has(logId)) return;
      fetchedExpandedIds.current.add(logId);
      setExpandedData((prev) => ({
        ...prev,
        [logId]: {
          originalBody: null,
          toAddress: '',
          ccAddress: null,
          bccAddress: null,
          attachmentCount: 0,
          attachmentNames: [],
          loading: true,
        },
      }));
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(`/api/email/original/${logId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setExpandedData((prev) => ({
            ...prev,
            [logId]: {
              originalBody: data.originalBody ?? null,
              toAddress: data.toAddress ?? '',
              ccAddress: data.ccAddress ?? null,
              bccAddress: data.bccAddress ?? null,
              attachmentCount: data.attachmentCount ?? 0,
              attachmentNames: data.attachmentNames ?? [],
              loading: false,
            },
          }));
        } else {
          setExpandedData((prev) => ({
            ...prev,
            [logId]: {
              originalBody: null,
              toAddress: '',
              ccAddress: null,
              bccAddress: null,
              attachmentCount: 0,
              attachmentNames: [],
              loading: false,
              error: 'Failed to load',
            },
          }));
        }
      } catch {
        setExpandedData((prev) => ({
          ...prev,
          [logId]: {
            originalBody: null,
            toAddress: '',
            ccAddress: null,
            bccAddress: null,
            attachmentCount: 0,
            attachmentNames: [],
            loading: false,
            error: 'Failed to load',
          },
        }));
      }
    },
    [firebaseUser],
  );

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
      setActiveDetailTab('content');
      fetchExpandedEmail(logId);
    }
  };

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    fetchLogs(newPage);
    setPage(newPage);
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          animation="slide-from-bottom"
          className="w-[95vw] max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
          hideCloseButton
        >
          {/* Header with tag/category info */}
          <DialogHeader className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5 flex-wrap">
              {isLogIdsMode ? (
                (sourceTitle ?? tk.relatedEmailsDesc)
              ) : (
                <>
                  {tk.relatedEmailsDesc}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]">
                    {categoryLabel}: {term}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isLogIdsMode
                ? (sourceTitle ?? tk.relatedEmailsDesc)
                : `${tk.relatedEmailsDesc} ${categoryLabel}: ${term}`}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable email list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 8 }).map((_, i) => (
                  <EmailRowSkeleton key={i} />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{tk.noRelatedEmails}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => {
                  const hasAtt = (log.attachmentCount ?? 0) > 0;
                  const expanded = selectedId === log.id;
                  const emailData = expandedData[log.id];

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        'px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors',
                        expanded && 'bg-yellow-50/70 dark:bg-yellow-900/10',
                      )}
                      onClick={() => handleToggleExpand(log.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex items-start gap-2">
                          {hasAtt ? (
                            <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />
                          ) : (
                            <Mail className="h-4 w-4 text-gray-200 dark:text-gray-700 opacity-60 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">
                              {log.subject}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                              {t.dashboard.emailHistory.from} {log.fromAddress}
                            </p>
                            {log.emailAnalysis && (
                              <div className="mt-1.5 space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {log.emailAnalysis.emailType && (
                                    <span
                                      className={cn(
                                        'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                                        TYPE_COLORS[log.emailAnalysis.emailType] ??
                                          DEFAULT_BADGE_COLOR,
                                      )}
                                    >
                                      {rowTypeLabel[log.emailAnalysis.emailType] ??
                                        log.emailAnalysis.emailType}
                                    </span>
                                  )}
                                  {log.emailAnalysis.sentiment && (
                                    <span
                                      className={cn(
                                        'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                                        SENTIMENT_COLORS[log.emailAnalysis.sentiment] ??
                                          DEFAULT_BADGE_COLOR,
                                      )}
                                    >
                                      {rowSentimentLabel[log.emailAnalysis.sentiment] ??
                                        log.emailAnalysis.sentiment}
                                    </span>
                                  )}
                                  {log.emailAnalysis.priority &&
                                    log.emailAnalysis.priority !== 'normal' && (
                                      <span
                                        className={cn(
                                          'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                                          PRIORITY_COLORS[log.emailAnalysis.priority] ??
                                            DEFAULT_BADGE_COLOR,
                                        )}
                                      >
                                        {rowPriorityLabel[log.emailAnalysis.priority] ??
                                          log.emailAnalysis.priority}
                                      </span>
                                    )}
                                  {log.emailAnalysis.requiresResponse && (
                                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                      {t.dashboard.emailHistory.analysisRequiresResponse}
                                    </span>
                                  )}
                                  {log.emailAnalysis.isUrgent && (
                                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                      {ts.isUrgent}
                                    </span>
                                  )}
                                </div>
                                {log.emailAnalysis.tags && log.emailAnalysis.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {log.emailAnalysis.tags.slice(0, 3).map((tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          {log.status !== 'forwarded' && (
                            <Badge variant={statusVariant[log.status] || 'default'}>
                              {statusLabel[log.status] ?? log.status}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatDate(log.receivedAt, locale)}
                          </span>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 pl-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
                            <TabsList>
                              <TabsTrigger
                                value="content"
                                title={t.dashboard.emailHistory.tabContent}
                              >
                                <Mail className="h-3.5 w-3.5 shrink-0mr-1.5" />
                                {t.dashboard.emailHistory.tabContent}
                              </TabsTrigger>
                              <TabsTrigger value="summary">
                                <AlignLeft className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                                {t.dashboard.emailHistory.tabSummary}
                              </TabsTrigger>
                              <TabsTrigger value="ai">
                                <Brain className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                                {t.dashboard.emailHistory.tabAiAnalysis}
                              </TabsTrigger>
                            </TabsList>

                            {/* Summary tab */}
                            <TabsContent value="summary" className="mt-3 space-y-3">
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">
                                  {t.dashboard.emailHistory.to}
                                </dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                                  {log.toAddress}
                                </dd>
                                {emailData?.ccAddress && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">
                                      {t.dashboard.emailHistory.cc}
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                                      {emailData.ccAddress}
                                    </dd>
                                  </>
                                )}
                                {emailData?.bccAddress && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">
                                      {t.dashboard.emailHistory.bcc}
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                                      {emailData.bccAddress}
                                    </dd>
                                  </>
                                )}
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">
                                  {t.dashboard.emailHistory.attachments}
                                </dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 overflow-hidden">
                                  {emailData?.loading ? (
                                    <span className="text-gray-400">…</span>
                                  ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) >
                                    0 ? (
                                    <AttachmentList
                                      names={
                                        emailData?.attachmentNames ?? log.attachmentNames ?? []
                                      }
                                    />
                                  ) : (
                                    <span className="text-gray-400">
                                      {t.dashboard.emailHistory.noAttachmentsShort}
                                    </span>
                                  )}
                                </dd>
                              </dl>
                              {log.ruleApplied && (
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">
                                    {t.dashboard.emailHistory.ruleApplied}
                                  </span>{' '}
                                  {log.ruleApplied}
                                </p>
                              )}
                              {log.tokensUsed !== undefined && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t.dashboard.emailHistory.tokens} {log.tokensUsed} |{' '}
                                  {t.dashboard.stats.estCost}: $
                                  {(log.estimatedCost || 0).toFixed(5)}
                                </p>
                              )}
                            </TabsContent>

                            {/* Content tab */}
                            <TabsContent value="content" className="mt-3 space-y-2">
                              {emailData?.loading && (
                                <div className="animate-pulse space-y-2 pt-1">
                                  <div className="h-50 w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
                                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                                </div>
                              )}
                              {emailData && !emailData.loading && emailData.originalBody && (
                                <>
                                  <SafeEmailIframe
                                    html={emailData.originalBody}
                                    className="rounded-lg"
                                    style={{ minHeight: '200px', maxHeight: '400px' }}
                                    maxAutoHeight={400}
                                    // autoResize
                                  />
                                  <div className="flex items-center gap-3 pt-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const emailData = expandedData[log.id];
                                        if (emailData?.originalBody) {
                                          onRequestFullscreen({
                                            subject: log.subject,
                                            body: emailData.originalBody,
                                          });
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                      title={t.emailOriginal.openFullPageView}
                                    >
                                      <i
                                        className="bi bi-fullscreen text-[11px]"
                                        aria-hidden="true"
                                      />
                                      {t.dashboard.emailHistory.viewFullPage}
                                    </button>
                                    {isAdmin && (
                                      <a
                                        href={`/email/original/${log.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-[#d0b53f] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        {t.dashboard.emailHistory.viewOriginal}
                                      </a>
                                    )}
                                  </div>
                                </>
                              )}
                              {emailData &&
                                !emailData.loading &&
                                !emailData.originalBody &&
                                !emailData.error && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                    {t.emailOriginal.noOriginalContent}
                                  </p>
                                )}
                            </TabsContent>

                            {/* AI Analysis tab */}
                            <TabsContent value="ai" className="mt-3">
                              <EmailAnalysisTabContent
                                emailId={log.id}
                                analysis={log.emailAnalysis}
                                onAnalysisUpdated={(analysis) =>
                                  handleAnalysisUpdated(log.id, analysis)
                                }
                              />
                            </TabsContent>
                          </Tabs>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer: result count + optional pagination + close button */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            {/* Left: result count */}
            <span
              role="status"
              aria-live="polite"
              className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5"
            >
              {loading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : totalCount !== undefined ? (
                <>
                  {totalCount} {t.dashboard.emailHistory.results}
                </>
              ) : null}
            </span>

            {/* Center: pagination (only when needed) */}
            {!loading && (hasNextPage || page > 1 || (totalPages ?? 0) > 1) && (
              <ResultsPagination
                page={page}
                totalPages={totalPages}
                hasNextPage={hasNextPage}
                disabled={loading}
                previousLabel={t.dashboard.emailHistory.previous}
                nextLabel={t.dashboard.emailHistory.next}
                onPageChange={handlePageChange}
              />
            )}

            {/* Right: close button */}
            <Button
              size="sm"
              onClick={onClose}
              aria-label={t.dashboard.rules.close}
              className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
            >
              {t.dashboard.rules.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
