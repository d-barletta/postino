'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Mail,
  Paperclip,
  ExternalLink,
  Search,
} from 'lucide-react';
import type { EmailLog } from '@/types';
import { EmailAnalysisPanel } from '@/components/dashboard/EmailAnalysisPanel';

const PAGE_SIZE = 20;
const ALL_STATUS_VALUE = '__all__';

interface EmailLogsListProps {
  selectedEmailId?: string;
  refreshTrigger?: number;
}

interface LogsResponse {
  logs: EmailLog[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalCount?: number;
  totalPages?: number;
}

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

export function EmailLogsList({ selectedEmailId, refreshTrigger }: EmailLogsListProps) {
  const { t, locale } = useI18n();
  const { firebaseUser, user } = useAuth();
  const isAdmin = user?.isAdmin === true;

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);

  // Pending (staged in UI, not yet applied)
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState(false);

  // Applied (trigger server fetch / client filter)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);

  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('summary');

  /** Tracks which email IDs have already had their expanded data fetched to avoid duplicate requests. */
  const fetchedExpandedIds = useRef<Set<string>>(new Set());

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

  const fetchLogs = useCallback(async (targetPage: number, isRefresh = false) => {
    if (!firebaseUser) return;
    if (isRefresh) setRefreshing(true);
    else setLogsLoading(true);
    setTotalCount(undefined);
    try {
      const token = await firebaseUser.getIdToken();
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
        ...(searchQuery ? { search: searchQuery } : {}),
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
      }
    } finally {
      setLogsLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, searchQuery, hasAttachmentsFilter]);

  // Initial load and when filters/search change
  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, searchQuery, hasAttachmentsFilter, refreshTrigger]);

  const handleApplyFilters = () => {
    setSearchQuery(pendingSearch.trim());
    setStatusFilter(pendingStatus);
    setHasAttachmentsFilter(pendingAttachments);
    setPage(1);
    setSelectedId(null);
  };

  const handleRefresh = async () => {
    await fetchLogs(1, true);
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

  const fetchExpandedEmail = useCallback(async (logId: string) => {
    if (!firebaseUser || fetchedExpandedIds.current.has(logId)) return;
    fetchedExpandedIds.current.add(logId);
    setExpandedData((prev) => ({
      ...prev,
      [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: true },
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
            toAddress: data.toAddress || '',
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
          [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
        }));
      }
    } catch {
      setExpandedData((prev) => ({
        ...prev,
        [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
      }));
    }
  }, [firebaseUser]);

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
    }
  };

  // Fullscreen keyboard handler
  useEffect(() => {
    if (!fullscreenEmailId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreenEmailId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreenEmailId]);

  // Client-side status filter applied on top of server results
  const filteredLogs = statusFilter
    ? logs.filter((l) => l.status === statusFilter)
    : logs;

  const hasPendingChanges =
    pendingSearch.trim() !== searchQuery ||
    pendingStatus !== statusFilter ||
    pendingAttachments !== hasAttachmentsFilter;

  const fullscreenLog = fullscreenEmailId ? expandedData[fullscreenEmailId] : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters(); }}
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

            {/* Row 3: Status filter + Attachments toggle + Count (left) + Remove filters (right) */}
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
                  {totalCount !== undefined ? totalCount : filteredLogs.length} {t.dashboard.emailHistory.results}
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
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
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
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              {searchQuery || hasAttachmentsFilter || statusFilter ? (
                <>
                  <p>{t.dashboard.emailHistory.noEmailsWithStatus} &ldquo;{statusLabel[statusFilter] ?? statusFilter}&rdquo;.</p>
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
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredLogs.map((log) => {
                  const hasAttachments = (log.attachmentCount ?? 0) > 0;
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
                          {hasAttachments ? (
                            <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />
                          ) : (
                            <Mail className="h-4 w-4 text-gray-300 dark:text-gray-600 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{log.subject}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">{t.dashboard.emailHistory.from} {log.fromAddress}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          <Badge variant={statusVariant[log.status] || 'default'}>{statusLabel[log.status] ?? log.status}</Badge>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt, locale)}</span>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 pl-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
                            <TabsList>
                              <TabsTrigger value="summary">{t.dashboard.emailHistory.tabSummary}</TabsTrigger>
                              <TabsTrigger value="content">{t.dashboard.emailHistory.tabContent}</TabsTrigger>
                              <TabsTrigger value="ai">{t.dashboard.emailHistory.tabAiAnalysis}</TabsTrigger>
                            </TabsList>

                            {/* Summary tab: metadata */}
                            <TabsContent value="summary" className="mt-3 space-y-3">
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.to}</dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{log.toAddress}</dd>
                                {(emailData?.ccAddress) && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.cc}</dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{emailData.ccAddress}</dd>
                                  </>
                                )}
                                {(emailData?.bccAddress) && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.bcc}</dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{emailData.bccAddress}</dd>
                                  </>
                                )}
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.attachments}</dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 overflow-hidden">
                                  {emailData?.loading ? (
                                    <span className="text-gray-400">…</span>
                                  ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) > 0 ? (
                                    <ul className="list-none space-y-0.5">
                                      {(emailData?.attachmentNames ?? log.attachmentNames ?? []).map((name, i) => (
                                        <li key={i} className="flex items-center gap-1 min-w-0">
                                          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
                                          <span className="truncate">{name}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-400">{t.dashboard.emailHistory.noAttachmentsShort}</span>
                                  )}
                                </dd>
                              </dl>

                              {log.ruleApplied && (
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">{t.dashboard.emailHistory.ruleApplied}</span> {log.ruleApplied}
                                </p>
                              )}
                              {log.tokensUsed !== undefined && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t.dashboard.emailHistory.tokens} {log.tokensUsed} | {t.dashboard.stats.estCost}: ${(log.estimatedCost || 0).toFixed(5)}
                                </p>
                              )}
                            </TabsContent>

                            {/* Content tab: email iframe */}
                            <TabsContent value="content" className="mt-3 space-y-2">
                              {emailData?.loading && (
                                <div className="animate-pulse space-y-2 pt-1">
                                  <div className="h-[200px] w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
                                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                                </div>
                              )}
                              {emailData && !emailData.loading && emailData.originalBody && (
                                <>
                                  <iframe
                                    sandbox=""
                                    srcDoc={emailData.originalBody}
                                    className="w-full border-0 rounded-lg"
                                    style={{ minHeight: '200px', maxHeight: '400px' }}
                                    title="Email content preview"
                                    onLoad={(e) => {
                                      const iframe = e.currentTarget;
                                      const height = iframe.contentDocument?.documentElement?.scrollHeight;
                                      if (height) iframe.style.height = `${Math.min(height + 20, 400)}px`;
                                    }}
                                  />
                                  <div className="flex items-center gap-3 pt-1">
                                    {isAdmin ? (
                                      <>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setFullscreenEmailId(log.id); }}
                                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                          title={t.emailOriginal.openFullPageView}
                                        >
                                          <i className="bi bi-fullscreen text-[11px]" aria-hidden="true" />
                                          {t.dashboard.emailHistory.viewFullPage}
                                        </button>
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
                                      </>
                                    ) : (
                                      <a
                                        href={`/email/original/${log.id}`}
                                        className="inline-flex items-center gap-1.5 text-xs text-[#d0b53f] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <i className="bi bi-fullscreen text-[11px]" aria-hidden="true" />
                                        {t.dashboard.emailHistory.viewFullPage}
                                      </a>
                                    )}
                                  </div>
                                </>
                              )}
                              {emailData && !emailData.loading && !emailData.originalBody && !emailData.error && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                  {t.emailOriginal.noOriginalContent}
                                </p>
                              )}
                            </TabsContent>

                            {/* AI Analysis tab */}
                            <TabsContent value="ai" className="mt-3">
                              {log.emailAnalysis ? (
                                <EmailAnalysisPanel
                                  analysis={log.emailAnalysis}
                                />
                              ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                  {t.dashboard.emailHistory.noAiAnalysis}
                                </p>
                              )}
                            </TabsContent>
                          </Tabs>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {(hasNextPage || page > 1) && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 dark:border-gray-800">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || refreshing}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t.dashboard.emailHistory.previous}
                  </Button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {t.dashboard.emailHistory.page} {page}
                    {totalPages !== undefined ? ` ${t.dashboard.emailHistory.of} ${totalPages}` : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!hasNextPage || refreshing}
                  >
                    {t.dashboard.emailHistory.next}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen overlay */}
      {typeof document !== 'undefined' && fullscreenEmailId && fullscreenLog?.originalBody &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col">
            <div className="h-14 shrink-0 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-4">
                {logs.find((l) => l.id === fullscreenEmailId)?.subject ?? ''}
              </p>
              <button
                onClick={() => setFullscreenEmailId(null)}
                className="shrink-0 rounded-md p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={t.emailOriginal.closeFullPageView}
                aria-label={t.emailOriginal.closeFullPageView}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <iframe
              sandbox=""
              srcDoc={fullscreenLog.originalBody}
              className="w-full flex-1 border-0"
              title="Original email content full page"
            />
          </div>,
          document.body
        )
      }
    </div>
  );
}

