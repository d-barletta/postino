'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EmailLogsCharts } from '@/components/admin/EmailLogsCharts';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
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
import { RefreshCw, ChevronLeft, ChevronRight, Search, Copy, Filter, FileJson } from 'lucide-react';

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
  agentTrace: unknown | null;
  attachmentCount: number;
  attachmentNames: string[];
}

interface AgentTraceStepView {
  step: string;
  status: 'ok' | 'warning' | 'error';
  detail?: string;
  data?: Record<string, unknown>;
  ts: string;
}

interface AgentTraceView {
  model: string;
  mode: 'sequential' | 'parallel';
  isHtmlInput: boolean;
  startedAt: string;
  finishedAt: string;
  steps: AgentTraceStepView[];
}

function asAgentTrace(value: unknown): AgentTraceView | null {
  if (!value || typeof value !== 'object') return null;
  const trace = value as AgentTraceView;
  if (!Array.isArray(trace.steps)) return null;
  return trace;
}

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  received: 'info',
  processing: 'default',
  forwarded: 'success',
  error: 'error',
  skipped: 'warning',
};

const ALL_STATUSES = ['received', 'processing', 'forwarded', 'error', 'skipped'] as const;
const ALL_STATUS_VALUE = '__all__';

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString();
}

function processingTime(receivedAt: string | null, processedAt: string | null): string {
  if (!receivedAt || !processedAt) return '\u2014';
  const ms = new Date(processedAt).getTime() - new Date(receivedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface AdminEmailsPageProps {
  showPageHeader?: boolean;
}

export default function AdminEmailsPage({ showPageHeader = true }: AdminEmailsPageProps) {
  const { authUser, getIdToken } = useAuth();
  const [logs, setLogs] = useState<AdminEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
  const [rawJsonLogId, setRawJsonLogId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  // Pending (staged in UI, not yet applied)
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState(false);

  // Applied (trigger server fetch)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);

  const fetchLogs = useCallback(
    async (targetPage: number, isRefresh = false) => {
      if (!authUser) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setTotalCount(undefined);
      try {
        let token = await getIdToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(hasAttachmentsFilter ? { hasAttachments: 'true' } : {}),
        });

        let res = await fetch(`/api/admin/emails?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Retry once with a forced token refresh for transient auth expiration.
        if (res.status === 401) {
          token = await getIdToken();
          res = await fetch(`/api/admin/emails?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          setPage(data.page ?? targetPage);
          setHasNextPage(data.hasNextPage ?? false);
          setTotalPages(data.totalPages);
          setTotalCount(data.totalCount);
          setExpanded(null);
          setFetchError('');
        } else {
          if (res.status === 401) {
            setFetchError('Unauthorized. Please sign in again.');
          } else if (res.status === 403) {
            setFetchError('Forbidden. Admin access is required.');
          } else {
            setFetchError('Failed to load email logs.');
          }
        }
      } catch {
        setFetchError('Failed to load email logs.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authUser, searchQuery, statusFilter, hasAttachmentsFilter],
  );

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  const handleApplyFilters = () => {
    setSearchQuery(pendingSearch.trim());
    setStatusFilter(pendingStatus);
    setHasAttachmentsFilter(pendingAttachments);
    setPage(1);
    setExpanded(null);
  };

  const handleRefresh = useCallback(async () => {
    await fetchLogs(1, true);
  }, [fetchLogs]);

  const handlePageChange = (newPage: number) => {
    setExpanded(null);
    fetchLogs(newPage);
  };

  const handleClearFilters = () => {
    setPendingSearch('');
    setPendingStatus('');
    setPendingAttachments(false);
    setSearchQuery('');
    setStatusFilter('');
    setHasAttachmentsFilter(false);
    setPage(1);
    setExpanded(null);
  };

  const handleCopyTrace = useCallback(async (logId: string, trace: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopiedTraceId(logId);
      setTimeout(() => setCopiedTraceId((current) => (current === logId ? null : current)), 1800);
    } catch {
      // No-op; clipboard can fail on non-secure contexts.
    }
  }, []);

  const hasPendingChanges =
    pendingSearch.trim() !== searchQuery ||
    pendingStatus !== statusFilter ||
    pendingAttachments !== hasAttachmentsFilter;

  const hasActiveFilters = searchQuery !== '' || statusFilter !== '' || hasAttachmentsFilter;

  const STATUS_OPTIONS = [
    { value: ALL_STATUS_VALUE, label: 'All statuses' },
    ...ALL_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  ];

  return (
    <div className="space-y-6 ui-fade-up">
      {showPageHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Logs</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Details of all emails processed by Postino
          </p>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* On mobile: email list first (order-1), charts second (order-2). On md+: reversed. */}
        <div className="order-2 md:order-1">
          <EmailLogsCharts logs={logs} loading={loading} />
        </div>

        <div className="order-1 md:order-2">
          <Card>
            <CardHeader
              heading="Processed Emails"
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
                </Button>
              }
              className="space-y-3"
            >
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
                    placeholder="Search subject, from, user..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-inset focus:ring-1 focus:ring-[#efd957] focus:border-[#efd957]"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleApplyFilters}
                  disabled={!hasPendingChanges || loading || refreshing}
                  className="shrink-0"
                >
                  Apply
                </Button>
              </div>

              {/* Row 3: Status filter + Attachments toggle + Count + Clear */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-44">
                  <Select
                    value={pendingStatus || ALL_STATUS_VALUE}
                    onValueChange={(v) => setPendingStatus(v === ALL_STATUS_VALUE ? '' : v)}
                  >
                    <SelectTrigger aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
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
                    aria-label="With attachments"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">With attachments</span>
                </div>
                {!loading && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {totalCount != null ? totalCount : logs.length} results
                  </span>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="ml-auto text-xs text-[#a3891f] dark:text-[#f3df79] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
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
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  {hasActiveFilters ? (
                    <>
                      <p>No emails match the current filters.</p>
                      <button
                        onClick={handleClearFilters}
                        className="text-sm mt-2 text-[#a3891f] dark:text-[#f3df79] hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    'No emails processed yet.'
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile card list (hidden on md+) */}
                  <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {logs.map((log) => (
                      <Fragment key={log.id}>
                        <div
                          className="px-4 py-3 cursor-pointer hover:bg-yellow-50/60 dark:hover:bg-yellow-900/10 transition-colors"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate flex-1">
                              {log.subject || '(no subject)'}
                            </p>
                            <Badge
                              variant={STATUS_VARIANT[log.status] || 'default'}
                              className="shrink-0"
                            >
                              {log.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">
                            From: {log.fromAddress}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">
                            User: {log.userEmail || log.userId}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500">
                            <span>{formatDate(log.receivedAt)}</span>
                            {log.tokensUsed != null && (
                              <span>{log.tokensUsed.toLocaleString()} tokens</span>
                            )}
                            {log.estimatedCost != null && (
                              <span>${log.estimatedCost.toFixed(5)}</span>
                            )}
                          </div>
                        </div>
                        {expanded === log.id && (
                          <div className="bg-yellow-50/40 dark:bg-yellow-900/5 px-4 py-3">
                            <Tabs defaultValue="details">
                              <TabsList>
                                <TabsTrigger value="details">Details</TabsTrigger>
                                {asAgentTrace(log.agentTrace) && (
                                  <TabsTrigger value="trace">Trace</TabsTrigger>
                                )}
                              </TabsList>

                              <TabsContent value="details">
                                <dl className="mt-3 grid grid-cols-1 gap-y-2 text-xs">
                                  <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">
                                      Email ID
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300 font-mono break-all">
                                      {log.id}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">
                                      To (Postino address)
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300 break-all">
                                      {log.toAddress}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">
                                      Processed at
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300">
                                      {formatDate(log.processedAt)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="font-medium text-gray-500 dark:text-gray-400">
                                      Processing time
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300">
                                      {processingTime(log.receivedAt, log.processedAt)}
                                    </dd>
                                  </div>
                                  {log.ruleApplied && (
                                    <div>
                                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                                        Rule applied
                                      </dt>
                                      <dd className="text-gray-700 dark:text-gray-300">
                                        {log.ruleApplied}
                                      </dd>
                                    </div>
                                  )}
                                  {(log.attachmentCount ?? 0) > 0 && (
                                    <div>
                                      <dt className="font-medium text-gray-500 dark:text-gray-400">
                                        Attachments
                                      </dt>
                                      <dd className="text-gray-700 dark:text-gray-300">
                                        {(log.attachmentNames ?? []).join(', ') ||
                                          `${log.attachmentCount} file(s)`}
                                      </dd>
                                    </div>
                                  )}
                                  {log.errorMessage && (
                                    <div>
                                      <dt className="font-medium text-red-500 dark:text-red-400">
                                        Error
                                      </dt>
                                      <dd className="text-red-600 dark:text-red-400 wrap-break-word">
                                        {log.errorMessage}
                                      </dd>
                                    </div>
                                  )}
                                </dl>
                              </TabsContent>

                              {asAgentTrace(log.agentTrace) && (
                                <TabsContent value="trace">
                                  {(() => {
                                    const trace = asAgentTrace(log.agentTrace)!;
                                    const filteredSteps = warningsOnly
                                      ? trace.steps.filter(
                                          (s) => s.status === 'warning' || s.status === 'error',
                                        )
                                      : trace.steps;

                                    return (
                                      <div className="mt-3 space-y-3 text-xs">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge variant="info">Model: {trace.model}</Badge>
                                          <Badge variant="default">Mode: {trace.mode}</Badge>
                                          <Badge variant="default">
                                            HTML input: {trace.isHtmlInput ? 'yes' : 'no'}
                                          </Badge>
                                          <Badge variant="default">
                                            Steps: {trace.steps.length}
                                          </Badge>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setWarningsOnly((v) => !v)}
                                          >
                                            <Filter className="h-3.5 w-3.5 mr-1" />
                                            {warningsOnly
                                              ? 'Show all steps'
                                              : 'Only warnings/errors'}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopyTrace(log.id, trace)}
                                          >
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                            {copiedTraceId === log.id
                                              ? 'Copied'
                                              : 'Copy trace JSON'}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                              setRawJsonLogId((v) => (v === log.id ? null : log.id))
                                            }
                                          >
                                            <FileJson className="h-3.5 w-3.5 mr-1" />
                                            {rawJsonLogId === log.id
                                              ? 'Hide raw JSON'
                                              : 'View raw JSON'}
                                          </Button>
                                        </div>

                                        <div className="space-y-2 max-h-64 overflow-auto pr-1">
                                          {filteredSteps.length === 0 ? (
                                            <p className="text-gray-500 dark:text-gray-400">
                                              No warning/error steps found for this trace.
                                            </p>
                                          ) : (
                                            filteredSteps.map((step, idx) => (
                                              <div
                                                key={`${step.ts}-${idx}`}
                                                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/30 p-2"
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <p className="font-medium text-gray-800 dark:text-gray-100">
                                                    {step.step}
                                                  </p>
                                                  <Badge
                                                    variant={
                                                      step.status === 'ok'
                                                        ? 'success'
                                                        : step.status === 'warning'
                                                          ? 'warning'
                                                          : 'error'
                                                    }
                                                  >
                                                    {step.status}
                                                  </Badge>
                                                </div>
                                                {step.detail && (
                                                  <p className="mt-1 text-gray-600 dark:text-gray-300 wrap-break-word">
                                                    {step.detail}
                                                  </p>
                                                )}
                                                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                                                  {formatDate(step.ts)}
                                                </p>
                                              </div>
                                            ))
                                          )}
                                        </div>

                                        {rawJsonLogId === log.id && (
                                          <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                                            {JSON.stringify(trace, null, 2)}
                                          </pre>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </TabsContent>
                              )}
                            </Tabs>
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>

                  {/* Desktop table (hidden on mobile) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                          <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                            Received
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                            User
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                            From
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                            Subject
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">
                            Time
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">
                            Tokens
                          </th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">
                            Cost
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <Fragment key={log.id}>
                            <tr
                              className="border-b border-gray-100 dark:border-gray-800 hover:bg-yellow-50/60 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors"
                              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                            >
                              <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {formatDate(log.receivedAt)}
                              </td>
                              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                <div
                                  className="max-w-35 truncate"
                                  title={log.userEmail || log.userId}
                                >
                                  {log.userEmail || log.userId}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                <div className="max-w-35 truncate" title={log.fromAddress}>
                                  {log.fromAddress}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-800 dark:text-gray-100">
                                <div className="max-w-50 truncate" title={log.subject}>
                                  {log.subject}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant={STATUS_VARIANT[log.status] || 'default'}>
                                  {log.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {processingTime(log.receivedAt, log.processedAt)}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                                {log.tokensUsed != null
                                  ? log.tokensUsed.toLocaleString()
                                  : '\u2014'}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                                {log.estimatedCost != null
                                  ? `$${log.estimatedCost.toFixed(5)}`
                                  : '\u2014'}
                              </td>
                            </tr>
                            {expanded === log.id && (
                              <tr className="bg-yellow-50/40 dark:bg-yellow-900/5">
                                <td colSpan={8} className="px-6 py-4">
                                  <Tabs defaultValue="details">
                                    <TabsList>
                                      <TabsTrigger value="details">Details</TabsTrigger>
                                      {asAgentTrace(log.agentTrace) && (
                                        <TabsTrigger value="trace">Trace</TabsTrigger>
                                      )}
                                    </TabsList>

                                    <TabsContent value="details">
                                      <dl className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                                        <div>
                                          <dt className="font-medium text-gray-500 dark:text-gray-400">
                                            Email ID
                                          </dt>
                                          <dd className="text-gray-700 dark:text-gray-300 font-mono break-all">
                                            {log.id}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="font-medium text-gray-500 dark:text-gray-400">
                                            To (Postino address)
                                          </dt>
                                          <dd className="text-gray-700 dark:text-gray-300 break-all">
                                            {log.toAddress}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="font-medium text-gray-500 dark:text-gray-400">
                                            Processed at
                                          </dt>
                                          <dd className="text-gray-700 dark:text-gray-300">
                                            {formatDate(log.processedAt)}
                                          </dd>
                                        </div>
                                        {log.ruleApplied && (
                                          <div className="col-span-2 md:col-span-3">
                                            <dt className="font-medium text-gray-500 dark:text-gray-400">
                                              Rule applied
                                            </dt>
                                            <dd className="text-gray-700 dark:text-gray-300">
                                              {log.ruleApplied}
                                            </dd>
                                          </div>
                                        )}
                                        {(log.attachmentCount ?? 0) > 0 && (
                                          <div className="col-span-2 md:col-span-3">
                                            <dt className="font-medium text-gray-500 dark:text-gray-400">
                                              Attachments
                                            </dt>
                                            <dd className="text-gray-700 dark:text-gray-300">
                                              {(log.attachmentNames ?? []).join(', ') ||
                                                `${log.attachmentCount} file(s)`}
                                            </dd>
                                          </div>
                                        )}
                                        {log.errorMessage && (
                                          <div className="col-span-2 md:col-span-3">
                                            <dt className="font-medium text-red-500 dark:text-red-400">
                                              Error
                                            </dt>
                                            <dd className="text-red-600 dark:text-red-400 wrap-break-word">
                                              {log.errorMessage}
                                            </dd>
                                          </div>
                                        )}
                                      </dl>
                                    </TabsContent>

                                    {asAgentTrace(log.agentTrace) && (
                                      <TabsContent value="trace">
                                        {(() => {
                                          const trace = asAgentTrace(log.agentTrace)!;
                                          const filteredSteps = warningsOnly
                                            ? trace.steps.filter(
                                                (s) =>
                                                  s.status === 'warning' || s.status === 'error',
                                              )
                                            : trace.steps;

                                          return (
                                            <div className="mt-3 space-y-3 text-xs">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="info">Model: {trace.model}</Badge>
                                                <Badge variant="default">Mode: {trace.mode}</Badge>
                                                <Badge variant="default">
                                                  HTML input: {trace.isHtmlInput ? 'yes' : 'no'}
                                                </Badge>
                                                <Badge variant="default">
                                                  Steps: {trace.steps.length}
                                                </Badge>
                                              </div>

                                              <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => setWarningsOnly((v) => !v)}
                                                >
                                                  <Filter className="h-3.5 w-3.5 mr-1" />
                                                  {warningsOnly
                                                    ? 'Show all steps'
                                                    : 'Only warnings/errors'}
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => handleCopyTrace(log.id, trace)}
                                                >
                                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                                  {copiedTraceId === log.id
                                                    ? 'Copied'
                                                    : 'Copy trace JSON'}
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() =>
                                                    setRawJsonLogId((v) =>
                                                      v === log.id ? null : log.id,
                                                    )
                                                  }
                                                >
                                                  <FileJson className="h-3.5 w-3.5 mr-1" />
                                                  {rawJsonLogId === log.id
                                                    ? 'Hide raw JSON'
                                                    : 'View raw JSON'}
                                                </Button>
                                              </div>

                                              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                                                {filteredSteps.length === 0 ? (
                                                  <p className="text-gray-500 dark:text-gray-400">
                                                    No warning/error steps found for this trace.
                                                  </p>
                                                ) : (
                                                  filteredSteps.map((step, idx) => (
                                                    <div
                                                      key={`${step.ts}-${idx}`}
                                                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/30 p-2"
                                                    >
                                                      <div className="flex items-center justify-between gap-2">
                                                        <p className="font-medium text-gray-800 dark:text-gray-100">
                                                          {step.step}
                                                        </p>
                                                        <Badge
                                                          variant={
                                                            step.status === 'ok'
                                                              ? 'success'
                                                              : step.status === 'warning'
                                                                ? 'warning'
                                                                : 'error'
                                                          }
                                                        >
                                                          {step.status}
                                                        </Badge>
                                                      </div>
                                                      {step.detail && (
                                                        <p className="mt-1 text-gray-600 dark:text-gray-300 wrap-break-word">
                                                          {step.detail}
                                                        </p>
                                                      )}
                                                      <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                                                        {formatDate(step.ts)}
                                                      </p>
                                                    </div>
                                                  ))
                                                )}
                                              </div>

                                              {rawJsonLogId === log.id && (
                                                <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                                                  {JSON.stringify(trace, null, 2)}
                                                </pre>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </TabsContent>
                                    )}
                                  </Tabs>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Page {page}
                      {totalPages != null ? ` / ${totalPages}` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={!hasNextPage}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
