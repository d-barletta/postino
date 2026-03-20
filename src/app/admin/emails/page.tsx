'use client';

import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EmailLogsCharts } from '@/components/admin/EmailLogsCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { RefreshCw, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

interface AdminEmailLog {
  id: string;
  userId: string;
  userEmail: string | null;
  toAddress: string;
  fromAddress: string;
  subject: string;
  receivedAt: string | null;
  processedAt: string | null;
  status: string;
  ruleApplied: string | null;
  tokensUsed: number | null;
  estimatedCost: number | null;
  errorMessage: string | null;
}

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  received: 'info',
  processing: 'warning',
  forwarded: 'success',
  error: 'error',
  skipped: 'default',
};

const ALL_STATUSES = ['received', 'processing', 'forwarded', 'error', 'skipped'] as const;
type EmailStatus = (typeof ALL_STATUSES)[number];

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function processingTime(receivedAt: string | null, processedAt: string | null): string {
  if (!receivedAt || !processedAt) return '—';
  const ms = new Date(processedAt).getTime() - new Date(receivedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface AdminEmailsPageProps {
  showPageHeader?: boolean;
}

export default function AdminEmailsPage({ showPageHeader = true }: AdminEmailsPageProps) {
  const { firebaseUser } = useAuth();
  const [logs, setLogs] = useState<AdminEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<EmailStatus | null>(null);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const buildUrl = useCallback((cursor: string | null, status: EmailStatus | null) => {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    if (status) params.set('status', status);
    return `/api/admin/emails?${params.toString()}`;
  }, []);

  const fetchPage = useCallback(async (cursor: string | null, status: EmailStatus | null): Promise<boolean> => {
    if (!firebaseUser) return false;
    try {
      let token = await firebaseUser.getIdToken();
      let res = await fetch(buildUrl(cursor, status), { headers: { Authorization: `Bearer ${token}` } });

      // Retry once with a forced token refresh for transient auth expiration.
      if (res.status === 401) {
        token = await firebaseUser.getIdToken(true);
        res = await fetch(buildUrl(cursor, status), { headers: { Authorization: `Bearer ${token}` } });
      }

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setHasMore(data.hasMore ?? false);
        setNextCursor(data.nextCursor ?? null);
        setExpanded(null);
        setFetchError('');
        return true;
      } else {
        if (res.status === 401) {
          setFetchError('Unauthorized. Please sign in again.');
        } else if (res.status === 403) {
          setFetchError('Forbidden. Admin access is required.');
        } else {
          setFetchError('Failed to load email logs.');
        }
        return false;
      }
    } catch {
      setFetchError('Failed to load email logs.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, buildUrl]);

  useEffect(() => { fetchPage(null, statusFilter); }, [fetchPage, statusFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setCursorStack([]);
    try { await fetchPage(null, statusFilter); }
    finally { setRefreshing(false); }
  }, [fetchPage, statusFilter]);

  const handleNextPage = useCallback(async () => {
    if (!nextCursor) return;
    const success = await fetchPage(nextCursor, statusFilter);
    if (success) setCursorStack((prev) => [...prev, nextCursor]);
  }, [nextCursor, fetchPage, statusFilter]);

  const handlePrevPage = useCallback(async () => {
    const newStack = [...cursorStack];
    newStack.pop();
    const prevCursor = newStack.length > 0 ? newStack[newStack.length - 1] : null;
    const success = await fetchPage(prevCursor, statusFilter);
    if (success) setCursorStack(newStack);
  }, [cursorStack, fetchPage, statusFilter]);

  const handleStatusFilter = useCallback((status: EmailStatus | null) => {
    setStatusFilter(status);
    setCursorStack([]);
    setSearchText('');
  }, []);

  const handleClearFilters = useCallback(() => {
    setStatusFilter(null);
    setSearchText('');
    setCursorStack([]);
  }, []);

  const currentPage = cursorStack.length + 1;
  const hasActiveFilters = statusFilter !== null || searchText.trim() !== '';

  // Client-side text search applied on top of server-side status filter
  const needle = searchText.trim().toLowerCase();
  const visibleLogs = needle
    ? logs.filter(
        (l) =>
          l.subject?.toLowerCase().includes(needle) ||
          l.fromAddress?.toLowerCase().includes(needle) ||
          l.userEmail?.toLowerCase().includes(needle) ||
          l.toAddress?.toLowerCase().includes(needle),
      )
    : logs;

  const btnBase = 'px-3 py-1 text-xs rounded-full transition-colors border whitespace-nowrap';
  const btnActive = 'font-semibold bg-[#EFD957] dark:bg-violet-600 text-gray-900 dark:text-white border-transparent';
  const btnInactive = 'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/10';

  const statusBtnClass = (active: boolean) => cn(btnBase, active ? btnActive : btnInactive);

  return (
    <div className="space-y-6 ui-fade-up">
      {showPageHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Logs</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Details of all emails processed by Postino</p>
        </div>
      )}

      {<EmailLogsCharts logs={logs} loading={loading} />}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Processed Emails</CardTitle>
            <div className="flex items-center gap-3">
              {!loading && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Page {currentPage} · {visibleLogs.length} records
                </span>
              )}
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={loading || refreshing} title="Refresh">
                <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Filter toolbar */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={statusBtnClass(statusFilter === null)}
                onClick={() => handleStatusFilter(null)}
              >
                All
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  className={statusBtnClass(statusFilter === s)}
                  onClick={() => handleStatusFilter(s)}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" aria-hidden />

            {/* Text search */}
            <div className="relative flex-1 min-w-36 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" aria-hidden />
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Search subject, from, user…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#EFD957] focus:border-[#EFD957]"
              />
            </div>

            {/* Clear button */}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 flex-1 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">{fetchError}</div>
          ) : visibleLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              {hasActiveFilters ? 'No emails match the current filters.' : 'No emails processed yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Received</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">User</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">From</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Subject</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Time</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Tokens</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLogs.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-yellow-50/60 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(log.receivedAt)}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="max-w-35 truncate" title={log.userEmail || log.userId}>{log.userEmail || log.userId}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="max-w-35 truncate" title={log.fromAddress}>{log.fromAddress}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-100">
                          <div className="max-w-50 truncate" title={log.subject}>{log.subject}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[log.status] || 'default'}>{log.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {processingTime(log.receivedAt, log.processedAt)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {log.tokensUsed != null ? log.tokensUsed.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {log.estimatedCost != null ? `$${log.estimatedCost.toFixed(5)}` : '—'}
                        </td>
                      </tr>
                      {expanded === log.id && (
                        <tr className="bg-yellow-50/40 dark:bg-yellow-900/5">
                          <td colSpan={8} className="px-6 py-4">
                            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                              <div>
                                <dt className="font-medium text-gray-500 dark:text-gray-400">Email ID</dt>
                                <dd className="text-gray-700 dark:text-gray-300 font-mono break-all">{log.id}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500 dark:text-gray-400">To (Postino address)</dt>
                                <dd className="text-gray-700 dark:text-gray-300 break-all">{log.toAddress}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500 dark:text-gray-400">Processed at</dt>
                                <dd className="text-gray-700 dark:text-gray-300">{formatDate(log.processedAt)}</dd>
                              </div>
                              {log.ruleApplied && (
                                <div className="col-span-2 md:col-span-3">
                                  <dt className="font-medium text-gray-500 dark:text-gray-400">Rule applied</dt>
                                  <dd className="text-gray-700 dark:text-gray-300">{log.ruleApplied}</dd>
                                </div>
                              )}
                              {log.errorMessage && (
                                <div className="col-span-2 md:col-span-3">
                                  <dt className="font-medium text-red-500 dark:text-red-400">Error</dt>
                                  <dd className="text-red-600 dark:text-red-400 wrap-break-word">{log.errorMessage}</dd>
                                </div>
                              )}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-xs text-gray-400 dark:text-gray-500">Page {currentPage}</span>
                <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={!hasMore}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
