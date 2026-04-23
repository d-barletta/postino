'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Mail, MousePointerClick, Paperclip, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { EmailDeleteDrawer } from '@/components/dashboard/EmailDeleteDrawer';
import { EmailDetailTabs } from '@/components/dashboard/EmailDetailTabs';
import {
  DEFAULT_BADGE_COLOR,
  EmailListItem,
  EmailRowSkeleton,
  PRIORITY_COLORS,
  SENTIMENT_COLORS,
  TYPE_COLORS,
  type ExpandedEmailData,
} from '@/components/dashboard/EmailListItem';
import { ResultsPagination } from '@/components/dashboard/ResultsPagination';
import { Spinner } from '@/components/ui/Spinner';
import { useI18n } from '@/lib/i18n';
import { useGlobalModals } from '@/lib/modals';
import { cn, formatDate } from '@/lib/utils';
import type { EmailAnalysis, EmailLog } from '@/types';

interface EmailLogsBrowserProps {
  header: ReactNode;
  emptyState: ReactNode;
  logs: EmailLog[];
  logsLoading: boolean;
  page: number;
  totalPages?: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  paginationDisabled?: boolean;
  expandedData: Record<string, ExpandedEmailData | undefined>;
  fetchExpandedEmail: (logId: string, options?: { force?: boolean }) => void | Promise<void>;
  markEmailAsRead?: (emailId: string) => void | Promise<void>;
  onToggleRead?: (emailId: string, currentIsRead: boolean) => void | Promise<void>;
  onDeleteEmail?: (emailId: string) => void | Promise<void>;
  onAnalysisUpdated?: (emailId: string, analysis: EmailAnalysis) => void;
  onCreditsUsed?: () => void;
  /** Called after an email is successfully queued for reprocessing. Allows the parent to refresh the email list. */
  onReprocessed?: () => void;
  selectedEmailId?: string;
  selectionResetKey?: string | number;
  narrowCardClassName?: string;
  narrowHeaderClassName?: string;
  wideContainerClassName?: string;
  wideHeaderClassName?: string;
  wideContainerStyle?: CSSProperties;
}

export function EmailLogsBrowser({
  header,
  emptyState,
  logs,
  logsLoading,
  page,
  totalPages,
  hasNextPage,
  onPageChange,
  paginationDisabled = false,
  expandedData,
  fetchExpandedEmail,
  markEmailAsRead,
  onToggleRead,
  onDeleteEmail,
  onAnalysisUpdated,
  onCreditsUsed,
  onReprocessed,
  selectedEmailId,
  selectionResetKey,
  narrowCardClassName = 'hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]',
  narrowHeaderClassName = 'py-2 px-4',
  wideContainerClassName = 'glass-panel rounded-2xl border-gray-200 dark:border-gray-700 overflow-y-auto shadow-sm bg-white dark:bg-gray-900 min-h-150',
  wideHeaderClassName = 'px-4 py-2.5',
  wideContainerStyle = { maxHeight: 'calc(100vh - 100px)' },
}: EmailLogsBrowserProps) {
  const { t, locale } = useI18n();
  const ts = t.dashboard.search;
  const { openFullPageEmail, updateFullPageEmail, fullPageEmailOpen } = useGlobalModals();

  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);
  const [activeDetailTab, setActiveDetailTab] = useState('summary');
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);
  const [deleteEmailId, setDeleteEmailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const hasInitializedSelectionReset = useRef(false);
  const selectedRowRef = useRef<HTMLDivElement | null>(null);

  // Scroll the selected row into view in the wide list whenever selection changes
  useEffect(() => {
    if (selectedId && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedEmailId) return;
    setSelectedId(selectedEmailId);
    fetchExpandedEmail(selectedEmailId);
    const clearSelectedEmailParam = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('selectedEmail')) return;
      url.searchParams.set('selectedEmail', '');
      window.history.replaceState(window.history.state, '', url);
    };

    if (!markEmailAsRead) {
      clearSelectedEmailParam();
      return;
    }
    const timer = setTimeout(() => {
      void markEmailAsRead(selectedEmailId);
      clearSelectedEmailParam();
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedEmailId, fetchExpandedEmail, markEmailAsRead]);

  useEffect(() => {
    if (selectionResetKey === undefined) return;
    if (!hasInitializedSelectionReset.current) {
      hasInitializedSelectionReset.current = true;
      return;
    }
    setSelectedId(null);
    setActiveDetailTab('summary');
  }, [selectionResetKey]);

  // Update the global modal body/loading state as expandedData loads for the fullscreen email
  useEffect(() => {
    if (!fullscreenEmailId) return;
    const expanded = expandedData[fullscreenEmailId];
    if (!expanded) return;
    updateFullPageEmail({
      body: expanded.originalBody ?? null,
      processedBody: expanded.processedBody ?? null,
      loading: expanded.loading ?? false,
    });
  }, [fullscreenEmailId, expandedData, updateFullPageEmail]);

  // When the global modal is closed (close button / Escape), reset local tracking state
  useEffect(() => {
    if (!fullPageEmailOpen) {
      setFullscreenEmailId(null);
    }
  }, [fullPageEmailOpen]);

  const statusLabel: Record<string, string> = {
    received: t.dashboard.charts.statusReceived,
    processing: t.dashboard.charts.statusProcessing,
    forwarded: t.dashboard.charts.statusForwarded,
    error: t.dashboard.charts.statusError,
    skipped: t.dashboard.charts.statusSkipped,
  };

  const statusVariant: Record<
    string,
    'info' | 'warning' | 'success' | 'error' | 'default' | 'skipped'
  > = {
    received: 'info',
    processing: 'default',
    forwarded: 'success',
    error: 'error',
    skipped: 'skipped',
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

  const selectedLog = selectedId ? (logs.find((log) => log.id === selectedId) ?? null) : null;
  const selectedEmailData = selectedId ? expandedData[selectedId] : undefined;
  const showPagination = !logsLoading && logs.length > 0 && (hasNextPage || page > 1);
  const previousSelectedStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedLog) {
      previousSelectedStatusRef.current = null;
      return;
    }
    const previousStatus = previousSelectedStatusRef.current;
    previousSelectedStatusRef.current = selectedLog.status;
    if (previousStatus === 'processing' && selectedLog.status !== 'processing') {
      void fetchExpandedEmail(selectedLog.id, { force: true });
    }
  }, [selectedLog, fetchExpandedEmail]);

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
      return;
    }

    setSelectedId(logId);
    setActiveDetailTab('summary');
    fetchExpandedEmail(logId);
    const log = logs.find((entry) => entry.id === logId);
    if (log?.isRead === false) {
      void markEmailAsRead?.(logId);
    }
  };

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    setActiveDetailTab('summary');
    onPageChange(newPage);
  };

  const handleFullscreen = (log: EmailLog) => {
    fetchExpandedEmail(log.id);
    if (log.isRead === false) {
      void markEmailAsRead?.(log.id);
    }
    const expanded = expandedData[log.id];
    setFullscreenEmailId(log.id);
    openFullPageEmail({
      subject: log.subject,
      body: expanded?.originalBody ?? null,
      processedBody:
        log.status === 'error' || log.status === 'skipped'
          ? null
          : (expanded?.processedBody ?? null),
      loading: !expanded || (expanded.loading ?? false),
    });
  };

  const handleViewFullscreen = (log: EmailLog, body: string | null, showRewritten: boolean) => {
    fetchExpandedEmail(log.id);
    if (log.isRead === false) {
      void markEmailAsRead?.(log.id);
    }
    const expanded = expandedData[log.id];
    setFullscreenEmailId(log.id);
    openFullPageEmail({
      subject: log.subject,
      body: expanded?.originalBody ?? body,
      processedBody:
        log.status === 'error' || log.status === 'skipped'
          ? null
          : (expanded?.processedBody ?? null),
      initialShowRewritten: showRewritten,
      loading: false,
    });
  };

  const handleDeleteEmail = async () => {
    if (!deleteEmailId || !onDeleteEmail) return;
    setDeleting(true);
    try {
      await onDeleteEmail(deleteEmailId);
      if (selectedId === deleteEmailId) {
        setSelectedId(null);
      }
    } catch (error) {
      console.error('Failed to delete email:', error);
    } finally {
      setDeleteEmailId(null);
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="min-[900px]:hidden">
        <Card className={narrowCardClassName}>
          <CardHeader className={narrowHeaderClassName}>{header}</CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 5 }).map((_, index) => (
                  <EmailRowSkeleton key={index} />
                ))}
              </div>
            ) : logs.length === 0 ? (
              emptyState
            ) : (
              <>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map((log) => (
                    <EmailListItem
                      key={log.id}
                      log={log}
                      expandedData={expandedData[log.id]}
                      isSelected={selectedId === log.id}
                      activeDetailTab={activeDetailTab}
                      onToggleExpand={() => handleToggleExpand(log.id)}
                      onTabChange={setActiveDetailTab}
                      onFullscreen={() => handleFullscreen(log)}
                      onViewFullscreen={(body, showRewritten) =>
                        handleViewFullscreen(log, body, showRewritten)
                      }
                      onDelete={onDeleteEmail ? () => setDeleteEmailId(log.id) : undefined}
                      onToggleRead={
                        onToggleRead ? () => onToggleRead(log.id, log.isRead !== false) : undefined
                      }
                      onAnalysisUpdated={
                        onAnalysisUpdated
                          ? (analysis) => onAnalysisUpdated(log.id, analysis)
                          : undefined
                      }
                      onCreditsUsed={onCreditsUsed}
                      onReprocessed={
                        onReprocessed
                          ? async () => {
                              await fetchExpandedEmail(log.id, { force: true });
                              onReprocessed();
                            }
                          : undefined
                      }
                      statusLayout="bottom"
                    />
                  ))}
                </div>

                {showPagination && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <ResultsPagination
                      page={page}
                      totalPages={totalPages}
                      hasNextPage={hasNextPage}
                      disabled={logsLoading || paginationDisabled}
                      previousLabel={t.dashboard.emailHistory.previous}
                      nextLabel={t.dashboard.emailHistory.next}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div
        className={cn('hidden min-[900px]:flex', wideContainerClassName)}
        style={wideContainerStyle}
      >
        <div className="w-100 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
          <div className={cn('border-b border-gray-100 dark:border-gray-800', wideHeaderClassName)}>
            {header}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {logsLoading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="px-5 py-4 animate-pulse">
                    <div className="flex items-start gap-2">
                      <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              emptyState
            ) : (
              logs.map((log) => {
                const hasAttachments = (log.attachmentCount ?? 0) > 0;
                const isUnread = log.isRead === false;
                const isSelected = selectedId === log.id;
                return (
                  <div
                    key={log.id}
                    ref={
                      isSelected
                        ? (el) => {
                            selectedRowRef.current = el;
                          }
                        : undefined
                    }
                    className={cn(
                      'px-4 py-3 cursor-pointer transition-colors border-l-2 group',
                      isSelected
                        ? 'bg-[#efd957]/20 dark:bg-[#efd957]/10 border-l-[#efd957]'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-transparent',
                    )}
                    onClick={() => handleToggleExpand(log.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="relative mt-0.5 shrink-0">
                        {hasAttachments ? (
                          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <Mail className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                        )}
                        {isUnread && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500 dark:bg-yellow-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm truncate',
                            isSelected
                              ? 'font-semibold text-gray-900 dark:text-gray-50'
                              : 'font-medium text-gray-800 dark:text-gray-100',
                          )}
                        >
                          {log.subject}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {log.fromAddress}
                        </p>
                        {log.emailAnalysis && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {log.emailAnalysis.emailType && (
                              <span
                                className={cn(
                                  'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                                  TYPE_COLORS[log.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR,
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
                            {log.emailAnalysis.requiresResponse && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                {t.dashboard.emailHistory.analysisRequiresResponse}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge
                            variant={statusVariant[log.status] || 'default'}
                            className="text-[10px] px-1.5 py-0 h-4"
                          >
                            {log.status === 'processing' && (
                              <Spinner className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                            )}
                            {statusLabel[log.status] ?? log.status}
                          </Badge>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatDate(log.receivedAt, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showPagination && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
              <ResultsPagination
                page={page}
                totalPages={totalPages}
                hasNextPage={hasNextPage}
                disabled={logsLoading || paginationDisabled}
                compact
                previousLabel={t.dashboard.emailHistory.previous}
                nextLabel={t.dashboard.emailHistory.next}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedLog ? (
            <>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {selectedLog.subject}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {t.dashboard.emailHistory.from} {selectedLog.fromAddress}
                    </p>
                  </div>
                  {onDeleteEmail && (
                    <button
                      onClick={() => setDeleteEmailId(selectedLog.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                      title={t.dashboard.emailHistory.deleteEmail}
                      aria-label={t.dashboard.emailHistory.deleteEmail}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {selectedLog.emailAnalysis && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedLog.emailAnalysis.emailType && (
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                          TYPE_COLORS[selectedLog.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR,
                        )}
                      >
                        {rowTypeLabel[selectedLog.emailAnalysis.emailType] ??
                          selectedLog.emailAnalysis.emailType}
                      </span>
                    )}
                    {selectedLog.emailAnalysis.sentiment && (
                      <span
                        className={cn(
                          'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                          SENTIMENT_COLORS[selectedLog.emailAnalysis.sentiment] ??
                            DEFAULT_BADGE_COLOR,
                        )}
                      >
                        {rowSentimentLabel[selectedLog.emailAnalysis.sentiment] ??
                          selectedLog.emailAnalysis.sentiment}
                      </span>
                    )}
                    {selectedLog.emailAnalysis.priority &&
                      selectedLog.emailAnalysis.priority !== 'normal' && (
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
                            PRIORITY_COLORS[selectedLog.emailAnalysis.priority] ??
                              DEFAULT_BADGE_COLOR,
                          )}
                        >
                          {rowPriorityLabel[selectedLog.emailAnalysis.priority] ??
                            selectedLog.emailAnalysis.priority}
                        </span>
                      )}
                    {selectedLog.emailAnalysis.requiresResponse && (
                      <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        {t.dashboard.emailHistory.analysisRequiresResponse}
                      </span>
                    )}
                    {selectedLog.emailAnalysis.isUrgent && (
                      <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        {ts.isUrgent}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
                <EmailDetailTabs
                  log={selectedLog}
                  emailData={selectedEmailData}
                  activeTab={activeDetailTab}
                  onTabChange={setActiveDetailTab}
                  onFullscreen={() => handleFullscreen(selectedLog)}
                  onViewFullscreen={(body, showRewritten) =>
                    handleViewFullscreen(selectedLog, body, showRewritten)
                  }
                  onAnalysisUpdated={
                    onAnalysisUpdated
                      ? (analysis) => onAnalysisUpdated(selectedLog.id, analysis)
                      : undefined
                  }
                  onCreditsUsed={onCreditsUsed}
                  onReprocessed={
                    onReprocessed
                      ? async () => {
                          await fetchExpandedEmail(selectedLog.id, { force: true });
                          onReprocessed();
                        }
                      : undefined
                  }
                  fillAvailableHeight
                  className="flex flex-col flex-1 overflow-hidden"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600 select-none">
              <MousePointerClick className="h-10 w-10" />
              <p className="text-sm">{t.dashboard.emailHistory.selectEmailToRead}</p>
            </div>
          )}
        </div>
      </div>

      {onDeleteEmail && (
        <EmailDeleteDrawer
          open={!!deleteEmailId}
          deleting={deleting}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteEmailId(null);
            }
          }}
          onConfirm={handleDeleteEmail}
        />
      )}
    </>
  );
}
