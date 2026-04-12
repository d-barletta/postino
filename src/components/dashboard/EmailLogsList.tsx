'use client';

import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { EmailDetailTabs } from '@/components/dashboard/EmailDetailTabs';
import { useEmailExpansion } from '@/hooks/useEmailExpansion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { formatDate, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { SafeEmailIframe } from '@/components/ui/SafeEmailIframe';
import { RefreshCw, Mail, Paperclip, Search, MousePointerClick } from 'lucide-react';
import type { EmailAnalysis, EmailLog, LogsResponse } from '@/types';
import { ResultsPagination } from '@/components/dashboard/ResultsPagination';
import { Spinner } from '@/components/ui/Spinner';

const PAGE_SIZE = 20;
const ALL_STATUS_VALUE = '__all__';

interface EmailLogsListProps {
  selectedEmailId?: string;
  refreshTrigger?: number;
}

export function EmailLogsList({ selectedEmailId, refreshTrigger }: EmailLogsListProps) {
  const { t, locale } = useI18n();
  const { authUser, getIdToken } = useAuth();

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [totalEmailCount, setTotalEmailCount] = useState<number | undefined>(undefined);
  const [totalEmailCountLoading, setTotalEmailCountLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);

  // Pending (staged in UI, not yet applied)
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState(false);

  // Applied (trigger server fetch / client filter)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);

  const { expandedData, fetchExpandedEmail } = useEmailExpansion();
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('summary');

  const handleAnalysisUpdated = useCallback((emailId: string, analysis: EmailAnalysis) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === emailId ? { ...log, emailAnalysis: analysis } : log)),
    );
  }, []);

  const markEmailAsRead = useCallback(
    async (emailId: string) => {
      setLogs((prev) => prev.map((log) => (log.id === emailId ? { ...log, isRead: true } : log)));
      try {
        const token = await getIdToken();
        await fetch(`/api/email/${emailId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // best-effort; don't surface errors to the user
      }
    },
    [getIdToken],
  );

  const STATUS_OPTIONS = [
    { value: ALL_STATUS_VALUE, label: t.dashboard.emailHistory.allStatuses },
    { value: 'received', label: t.dashboard.charts.received },
    { value: 'processing', label: t.dashboard.charts.processing },
    { value: 'forwarded', label: t.dashboard.charts.forwarded },
    { value: 'error', label: t.dashboard.charts.error },
    { value: 'skipped', label: t.dashboard.charts.skipped },
  ];

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

  const fetchLogs = useCallback(
    async (targetPage: number, isRefresh = false) => {
      if (!authUser) return;
      if (isRefresh) setRefreshing(true);
      else setLogsLoading(true);
      setTotalCount(undefined);
      try {
        const token = await getIdToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(hasAttachmentsFilter ? { hasAttachments: 'true' } : {}),
        });
        const res = await fetch(`/api/email/logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: LogsResponse = await res.json();
          setLogs(data.logs || []);
          setPage(data.page);
          setHasNextPage(data.hasNextPage);
          setTotalPages(data.totalPages);
          setTotalCount(data.totalCount);
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLogsLoading(false);
        setRefreshing(false);
      }
    },
    [authUser, searchQuery, statusFilter, hasAttachmentsFilter, t],
  );

  const fetchTotalCount = useCallback(async () => {
    if (!authUser) return;
    setTotalEmailCountLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/email/logs/count', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: { count: number } = await res.json();
        setTotalEmailCount(data.count);
      } else {
        toast.error(t.dashboard.emailHistory.failedToLoadCount);
      }
    } finally {
      setTotalEmailCountLoading(false);
    }
  }, [authUser, t]);

  // Initial load and when filters/search change
  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [authUser, searchQuery, statusFilter, hasAttachmentsFilter, refreshTrigger, fetchLogs]);

  useEffect(() => {
    if (!authUser) return;
    setTotalEmailCount(undefined);
    if (!searchQuery && !statusFilter && !hasAttachmentsFilter) {
      fetchTotalCount();
    }
  }, [authUser, searchQuery, statusFilter, hasAttachmentsFilter, fetchTotalCount]);

  const handleApplyFilters = () => {
    setSearchQuery(pendingSearch.trim());
    setStatusFilter(pendingStatus);
    setHasAttachmentsFilter(pendingAttachments);
    setPage(1);
    setSelectedId(null);
  };

  const handleRefresh = async () => {
    await fetchLogs(1, true);
    if (!searchQuery && !statusFilter && !hasAttachmentsFilter) {
      await fetchTotalCount();
    }
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    fetchLogs(newPage);
    setPage(newPage);
  };

  const handleClearFilters = () => {
    setPendingSearch('');
    setPendingStatus('');
    setPendingAttachments(false);
    setSearchQuery('');
    setStatusFilter('');
    setHasAttachmentsFilter(false);
    setPage(1);
    setSelectedId(null);
  };

  // Auto-expand and fetch email content when opened from a push notification link.
  // This fires when selectedEmailId is provided as a prop (e.g., ?selectedEmail=xxx in URL).
  useEffect(() => {
    if (!selectedEmailId) return;
    setSelectedId(selectedEmailId);
    fetchExpandedEmail(selectedEmailId);
  }, [selectedEmailId, fetchExpandedEmail]);

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
      setActiveDetailTab('summary');
      fetchExpandedEmail(logId);
      const log = logs.find((l) => l.id === logId);
      if (log?.isRead === false) markEmailAsRead(logId);
    }
  };

  // Fullscreen keyboard handler
  useEffect(() => {
    if (!fullscreenEmailId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenEmailId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreenEmailId]);

  const hasPendingChanges =
    pendingSearch.trim() !== searchQuery ||
    pendingStatus !== statusFilter ||
    pendingAttachments !== hasAttachmentsFilter;

  const filteredLogs = logs;
  const effectiveTotalCount = totalCount ?? totalEmailCount;
  const effectiveTotalPages =
    totalPages ??
    (totalEmailCount !== undefined
      ? Math.max(1, Math.ceil(totalEmailCount / PAGE_SIZE))
      : undefined);

  const fullscreenLog = fullscreenEmailId ? expandedData[fullscreenEmailId] : null;

  // The currently selected log and its data (used by the wide right panel)
  const selectedLog = selectedId ? (logs.find((l) => l.id === selectedId) ?? null) : null;
  const selectedEmailData = selectedId ? expandedData[selectedId] : undefined;

  // Shared filter header JSX — rendered inside both narrow and wide layouts
  const filterHeader = (
    <div className="flex flex-col gap-3">
      {/* Row 1: Title + Refresh */}
      <div className="flex items-center justify-between">
        <CardTitle>{t.dashboard.tabs.emailHistory}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title={t.dashboard.emailHistory.refresh}
        >
          <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Row 2: Search input + Apply button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters();
            }}
            placeholder={t.dashboard.emailHistory.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
          />
        </div>
        <Button
          size="sm"
          onClick={handleApplyFilters}
          disabled={!hasPendingChanges || logsLoading || refreshing}
          className="shrink-0"
        >
          {t.dashboard.emailHistory.applyFilters}
        </Button>
      </div>

      {/* Row 3: Status filter + Attachments toggle + Count + Remove filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-40">
          <Select
            value={pendingStatus || ALL_STATUS_VALUE}
            onValueChange={(v) => setPendingStatus(v === ALL_STATUS_VALUE ? '' : v)}
          >
            <SelectTrigger aria-label={t.dashboard.emailHistory.filterByStatus}>
              <SelectValue placeholder={t.dashboard.emailHistory.allStatuses} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={pendingAttachments}
            onCheckedChange={setPendingAttachments}
            aria-label={t.dashboard.emailHistory.withAttachments}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {t.dashboard.emailHistory.withAttachments}
          </span>
        </div>
        {!logsLoading && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {effectiveTotalCount !== undefined
              ? effectiveTotalCount
              : totalEmailCountLoading
                ? '...'
                : filteredLogs.length}{' '}
            {searchQuery || statusFilter || hasAttachmentsFilter
              ? t.dashboard.emailHistory.results
              : t.dashboard.emailHistory.messages}
          </span>
        )}
        {(searchQuery || statusFilter || hasAttachmentsFilter) && (
          <button
            onClick={handleClearFilters}
            className="ml-auto text-xs text-[#a3891f] dark:text-[#f3df79] hover:underline"
          >
            {t.dashboard.emailHistory.clearFilter}
          </button>
        )}
      </div>
    </div>
  );

  // Shared loading skeleton
  const loadingSkeleton = (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-6 py-4 animate-pulse">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Shared empty state
  const emptyState = (
    <div className="text-center py-10 text-gray-400 dark:text-gray-500">
      {searchQuery || hasAttachmentsFilter || statusFilter ? (
        <>
          <p>
            {t.dashboard.emailHistory.noEmailsWithStatus} &ldquo;
            {statusLabel[statusFilter] ?? statusFilter}&rdquo;.
          </p>
          <button
            onClick={handleClearFilters}
            className="text-sm mt-2 text-[#a3891f] dark:text-[#f3df79] hover:underline"
          >
            {t.dashboard.emailHistory.clearFilter}
          </button>
        </>
      ) : (
        <>
          <p>{t.dashboard.emailHistory.noEmailsYet}</p>
          <p className="text-sm mt-1">{t.dashboard.emailHistory.noEmailsYetDesc}</p>
        </>
      )}
    </div>
  );

  // Pagination controls
  const showPagination = hasNextPage || page > 1 || (effectiveTotalPages ?? 0) > 1;

  const pagination = showPagination ? (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
      <ResultsPagination
        page={page}
        totalPages={effectiveTotalPages}
        hasNextPage={hasNextPage}
        disabled={refreshing || logsLoading}
        compact
        previousLabel={t.dashboard.emailHistory.previous}
        nextLabel={t.dashboard.emailHistory.next}
        onPageChange={handlePageChange}
      />
    </div>
  ) : null;

  return (
    <>
      {/* ================================================================
          NARROW LAYOUT  (< 1200px) — original card with inline expansion
          ================================================================ */}
      <div className="xl:hidden space-y-4">
        <Card>
          <CardHeader>{filterHeader}</CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              loadingSkeleton
            ) : filteredLogs.length === 0 ? (
              emptyState
            ) : (
              <>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredLogs.map((log) => {
                    const hasAttachments = (log.attachmentCount ?? 0) > 0;
                    const isUnread = log.isRead === false;
                    const expanded = selectedId === log.id;
                    const emailData = expandedData[log.id];
                    return (
                      <div
                        key={log.id}
                        className={`px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors ${expanded ? 'bg-yellow-50/70 dark:bg-yellow-900/10' : ''}`}
                        onClick={() => handleToggleExpand(log.id)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                          <div className="min-w-0 flex items-start gap-2">
                            <div className="relative mt-0.5 shrink-0">
                              {hasAttachments ? (
                                <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <Mail className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                              )}
                              {isUnread && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500 dark:bg-yellow-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">
                                {log.subject}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                                {t.dashboard.emailHistory.from} {log.fromAddress}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                            <Badge variant={statusVariant[log.status] || 'default'}>
                              {log.status === 'processing' && (
                                <Spinner className="h-3 w-3 mr-1 shrink-0" />
                              )}
                              {statusLabel[log.status] ?? log.status}
                            </Badge>
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
                            <EmailDetailTabs
                              log={log}
                              emailData={emailData}
                              activeTab={activeDetailTab}
                              onTabChange={setActiveDetailTab}
                              onFullscreen={() => {
                                if (log.isRead === false) markEmailAsRead(log.id);
                                setFullscreenEmailId(log.id);
                              }}
                              onAnalysisUpdated={(analysis) =>
                                handleAnalysisUpdated(log.id, analysis)
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {pagination}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================
          WIDE LAYOUT  (≥ 1200px) — macOS Mail-style split pane
          ================================================================ */}
      <div className="hidden xl:flex gap-0 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-y-auto shadow-sm bg-white dark:bg-gray-900 min-h-150 max-h-225">
        {/* Left pane: list */}
        <div className="w-100 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* Header / filters */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            {filterHeader}
          </div>
          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {logsLoading
              ? loadingSkeleton
              : filteredLogs.length === 0
                ? emptyState
                : filteredLogs.map((log) => {
                    const hasAttachments = (log.attachmentCount ?? 0) > 0;
                    const isUnread = log.isRead === false;
                    const selected = selectedId === log.id;
                    return (
                      <div
                        key={log.id}
                        className={cn(
                          'px-5 py-3.5 cursor-pointer transition-colors',
                          selected
                            ? 'bg-[#efd957]/20 dark:bg-[#efd957]/10 border-l-2 border-l-[#efd957]'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-l-transparent',
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
                                selected
                                  ? 'font-semibold text-gray-900 dark:text-gray-50'
                                  : 'font-medium text-gray-800 dark:text-gray-100',
                              )}
                            >
                              {log.subject}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {log.fromAddress}
                            </p>
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
                  })}
          </div>
          {/* Pagination pinned to bottom */}
          {!logsLoading && filteredLogs.length > 0 && pagination}
        </div>

        {/* Right pane: detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedLog ? (
            <>
              {/* Detail header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {selectedLog.subject}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {t.dashboard.emailHistory.from} {selectedLog.fromAddress}
                </p>
              </div>
              {/* Scrollable tabs content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <EmailDetailTabs
                  log={selectedLog}
                  emailData={selectedEmailData}
                  activeTab={activeDetailTab}
                  onTabChange={setActiveDetailTab}
                  onFullscreen={() => {
                    if (selectedLog.isRead === false) markEmailAsRead(selectedLog.id);
                    setFullscreenEmailId(selectedLog.id);
                  }}
                  onAnalysisUpdated={(analysis) => handleAnalysisUpdated(selectedLog.id, analysis)}
                />
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 px-6 py-5 text-gray-400 dark:text-gray-600 select-none">
              <MousePointerClick className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm">{t.dashboard.emailHistory.selectEmailToRead}</p>
            </div>
          )}
        </div>
      </div>

      {/* Full page email modal (shared between both layouts) */}
      <Dialog
        open={!!fullscreenEmailId && !!fullscreenLog?.originalBody}
        onOpenChange={(open) => {
          if (!open) setFullscreenEmailId(null);
        }}
      >
        <DialogContent
          hideCloseButton
          className={cn('w-[95vw] max-w-4xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0')}
          aria-describedby={undefined}
        >
          {fullscreenLog?.originalBody && (
            <SafeEmailIframe html={fullscreenLog.originalBody} className="flex-1" />
          )}
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {logs.find((l) => l.id === fullscreenEmailId)?.subject ?? ''}
            </DialogTitle>
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                {t.dashboard.rules.close}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
