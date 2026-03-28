'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Maximize2,
  Search,
} from 'lucide-react';
import type { EmailLog } from '@/types';

const PAGE_SIZE = 20;
const ALL_STATUS_VALUE = '__all__';
const SEARCH_DEBOUNCE_MS = 400;

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
  attachmentCount: number;
  attachmentNames: string[];
  loading: boolean;
  error?: string;
}

export function EmailLogsList({ selectedEmailId, refreshTrigger }: EmailLogsListProps) {
  const { t } = useI18n();
  const { firebaseUser, user } = useAuth();
  const isAdmin = user?.isAdmin === true;

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);

  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);

  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [firebaseUser, searchQuery, hasAttachmentsFilter, statusFilter, refreshTrigger]);

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
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

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value === ALL_STATUS_VALUE ? '' : value);
    setPage(1);
    setSelectedId(null);
  };

  const handleAttachmentsToggle = (checked: boolean) => {
    setHasAttachmentsFilter(checked);
    setPage(1);
    setSelectedId(null);
  };

  const fetchExpandedEmail = useCallback(async (logId: string) => {
    if (!firebaseUser || expandedData[logId]) return;
    setExpandedData((prev) => ({
      ...prev,
      [logId]: { originalBody: null, toAddress: '', ccAddress: null, attachmentCount: 0, attachmentNames: [], loading: true },
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
            attachmentCount: data.attachmentCount ?? 0,
            attachmentNames: data.attachmentNames ?? [],
            loading: false,
          },
        }));
      } else {
        setExpandedData((prev) => ({
          ...prev,
          [logId]: { originalBody: null, toAddress: '', ccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
        }));
      }
    } catch {
      setExpandedData((prev) => ({
        ...prev,
        [logId]: { originalBody: null, toAddress: '', ccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
      }));
    }
  }, [firebaseUser, expandedData]);

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
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

  const fullscreenLog = fullscreenEmailId ? expandedData[fullscreenEmailId] : null;

  if (logsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-8 w-8 border-4 border-[#efd957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle>{t.dashboard.tabs.emailHistory}</CardTitle>
              <div className="flex items-center gap-2">
                <div className="w-44">
                  <Select
                    value={statusFilter || ALL_STATUS_VALUE}
                    onValueChange={handleStatusFilter}
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
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t.dashboard.emailHistory.searchPlaceholder}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
              />
            </div>

            {/* Attachment filter toggle */}
            <div className="flex items-center gap-2">
              <Switch
                checked={hasAttachmentsFilter}
                onCheckedChange={handleAttachmentsToggle}
                aria-label={t.dashboard.emailHistory.withAttachments}
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t.dashboard.emailHistory.withAttachments}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              {searchQuery || hasAttachmentsFilter || statusFilter ? (
                <>
                  <p>{t.dashboard.emailHistory.noEmailsWithStatus} &ldquo;{statusLabel[statusFilter] ?? statusFilter}&rdquo;.</p>
                  <button
                    onClick={() => { handleStatusFilter(''); setSearchInput(''); setSearchQuery(''); setHasAttachmentsFilter(false); }}
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
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">{log.subject}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 wrap-break-word">{t.dashboard.emailHistory.from} {log.fromAddress}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          <Badge variant={statusVariant[log.status] || 'default'}>{statusLabel[log.status] ?? log.status}</Badge>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt)}</span>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3 pl-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Email metadata */}
                          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                            <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.to}</dt>
                            <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{log.toAddress}</dd>
                            {(emailData?.ccAddress) && (
                              <>
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.cc}</dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{emailData.ccAddress}</dd>
                              </>
                            )}
                            <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.attachments}</dt>
                            <dd className="text-gray-700 dark:text-gray-300">
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

                          {/* Rule & tokens info */}
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

                          {/* Email content iframe */}
                          <div className="space-y-2">
                            {emailData?.loading && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
                                {t.dashboard.emailHistory.loadingEmail}
                              </p>
                            )}
                            {emailData && !emailData.loading && emailData.originalBody && (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                    {t.emailOriginal.emailContent}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {isAdmin ? (
                                      <>
                                        <a
                                          href={`/email/original/${log.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-[#d0b53f] hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          {t.dashboard.emailHistory.viewOriginal}
                                        </a>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setFullscreenEmailId(log.id); }}
                                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                                          title={t.emailOriginal.openFullPageView}
                                        >
                                          <Maximize2 className="h-3 w-3" />
                                          {t.dashboard.emailHistory.viewFullPage}
                                        </button>
                                      </>
                                    ) : (
                                      <a
                                        href={`/email/original/${log.id}`}
                                        className="inline-flex items-center gap-1 text-xs text-[#d0b53f] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Maximize2 className="h-3 w-3" />
                                        {t.dashboard.emailHistory.viewFullPage}
                                      </a>
                                    )}
                                  </div>
                                </div>
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
                              </>
                            )}
                            {emailData && !emailData.loading && !emailData.originalBody && !emailData.error && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                {t.emailOriginal.noOriginalContent}
                              </p>
                            )}
                          </div>
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
      {fullscreenEmailId && fullscreenLog?.originalBody && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <div className="absolute inset-0 flex flex-col">
            <div className="h-14 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
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
              style={{ minHeight: 'calc(100dvh - 56px)' }}
              title="Original email content full page"
            />
          </div>
        </div>
      )}
    </div>
  );
}

