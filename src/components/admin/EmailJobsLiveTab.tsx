'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { RefreshCw, Play, AlertTriangle, Trash2, Copy, Check, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Spinner } from '@/components/ui/Spinner';

interface JobCounts {
  pending: number;
  processing: number;
  retrying: number;
  done: number;
  failed: number;
}

interface RecentFailure {
  id: string;
  updatedAt: string | null;
  attempts: number;
  error: string;
  subject: string;
  sender: string;
  userEmail: string | null;
  logId: string | null;
}

interface JobsOverviewResponse {
  counts: JobCounts;
  backlog: number;
  latestUpdatedAt: string | null;
  recentFailures: RecentFailure[];
  webhookLoggingEnabled: boolean;
  recentWebhookRequests: WebhookRequestLog[];
}

interface WebhookRequestLog {
  id: string;
  receivedAt: string | null;
  updatedAt: string | null;
  status: string;
  result: string;
  reason: string | null;
  sender: string;
  recipient: string;
  subject: string;
  messageId: string;
  attachmentCount: number;
  ip: string;
  userAgent: string;
  emailLogId: string | null;
  jobId: string | null;
  payloadStoragePath: string | null;
}

const REFRESH_MS = 15000;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function compactError(message: string, maxLen = 140): string {
  return message.length > maxLen ? `${message.slice(0, maxLen)}…` : message;
}

function WebhookLogRow({
  row,
  getIdToken,
}: {
  row: WebhookRequestLog;
  getIdToken: () => Promise<string | null>;
}) {
  const [payload, setPayload] = useState<string | null>(null);
  const [loadingPayload, setLoadingPayload] = useState(false);
  const [payloadError, setPayloadError] = useState('');
  const [copied, setCopied] = useState(false);
  const fetchedRef = useRef(false);

  const loadPayload = useCallback(async () => {
    if (fetchedRef.current) return;
    if (!row.payloadStoragePath) {
      setPayload('(no payload file stored for this log)');
      fetchedRef.current = true;
      return;
    }
    fetchedRef.current = true;
    setLoadingPayload(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setPayloadError('Not authenticated');
        return;
      }
      const res = await fetch(`/api/admin/email-jobs/${row.id}/payload`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setPayloadError(body.error ?? 'Failed to load payload');
        return;
      }
      setPayload(await res.text());
    } catch {
      setPayloadError('Failed to load payload');
    } finally {
      setLoadingPayload(false);
    }
  }, [row.id, row.payloadStoragePath, getIdToken]);

  const handleCopy = useCallback(async () => {
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [payload]);

  return (
    <details
      key={row.id}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) loadPayload();
      }}
      className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20"
    >
      <summary className="cursor-pointer list-none">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant="info">{row.status}</Badge>
          <Badge variant="secondary">{row.result}</Badge>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(row.receivedAt)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            attachments: {row.attachmentCount}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {row.subject || '(no subject)'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">from {row.sender}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">to {row.recipient}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">ip {row.ip}</p>
        {row.reason ? (
          <p className="mt-1 break-all text-xs text-amber-700 dark:text-amber-300">{row.reason}</p>
        ) : null}
      </summary>

      <div className="mt-3 space-y-2 border-t border-blue-200 pt-3 dark:border-blue-900">
        {row.emailLogId ? (
          <a
            className="text-xs text-blue-600 underline dark:text-blue-300"
            href={`/email/original/${row.emailLogId}`}
            target="_blank"
            rel="noreferrer"
          >
            open linked email log
          </a>
        ) : null}
        {row.jobId ? (
          <p className="break-all text-xs text-gray-500 dark:text-gray-400">job id: {row.jobId}</p>
        ) : null}
        {row.messageId ? (
          <p className="break-all text-xs text-gray-500 dark:text-gray-400">
            message id: {row.messageId}
          </p>
        ) : null}
        <p className="break-all text-xs text-gray-500 dark:text-gray-400">
          user-agent: {row.userAgent || '—'}
        </p>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Full Mailgun payload
            </span>
            {payload ? (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                type="button"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : null}
          </div>
          {loadingPayload ? (
            <p className="text-xs text-gray-400">Loading payload…</p>
          ) : payloadError ? (
            <p className="text-xs text-red-500">{payloadError}</p>
          ) : (
            <textarea
              readOnly
              value={payload ?? ''}
              className="h-80 w-full resize-y rounded-md bg-gray-900 p-3 font-mono text-[11px] leading-5 text-gray-100 focus:outline-none"
            />
          )}
        </div>
      </div>
    </details>
  );
}

export default function EmailJobsLiveTab() {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<JobsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingNow, setProcessingNow] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loggingSaving, setLoggingSaving] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [retryingJobs, setRetryingJobs] = useState<Set<string>>(new Set());

  const fetchOverview = useCallback(
    async (silent = false) => {
      if (!authUser) return;
      if (!silent) setLoading(true);
      try {
        const token = await getIdToken();
        const res = await fetch('/api/admin/email-jobs', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          setError('Failed to fetch queue data');
          return;
        }
        const body = (await res.json()) as JobsOverviewResponse;
        setData(body);
        setError('');
      } catch {
        setError('Failed to fetch queue data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authUser],
  );

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      setRefreshing(true);
      fetchOverview(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, fetchOverview]);

  const handleProcessNow = useCallback(async () => {
    if (!authUser) return;
    setProcessingNow(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/email-jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 20 }),
      });

      if (!res.ok) {
        toast.error(t.admin.toasts.failedToProcessQueue);
        return;
      }

      await fetchOverview(true);
    } catch {
      toast.error(t.admin.toasts.failedToProcessQueue);
    } finally {
      setProcessingNow(false);
    }
  }, [authUser, fetchOverview]);

  const handleToggleWebhookLogging = useCallback(
    async (enabled: boolean) => {
      if (!authUser) return;
      setLoggingSaving(true);
      try {
        const token = await getIdToken();
        const res = await fetch('/api/admin/email-jobs', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ webhookLoggingEnabled: enabled }),
        });

        if (!res.ok) {
          toast.error(t.admin.toasts.failedToUpdateMailgunSetting);
          return;
        }

        setData((prev) => (prev ? { ...prev, webhookLoggingEnabled: enabled } : prev));
        await fetchOverview(true);
      } catch {
        toast.error(t.admin.toasts.failedToUpdateMailgunSetting);
      } finally {
        setLoggingSaving(false);
      }
    },
    [authUser, fetchOverview],
  );

  const handleClearWebhookLogs = useCallback(async () => {
    if (!authUser || clearingLogs) return;

    const confirmed = window.confirm(
      'Delete all Mailgun inbound webhook request logs? This action cannot be undone.',
    );
    if (!confirmed) return;

    setClearingLogs(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/admin/email-jobs', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        toast.error(t.admin.toasts.failedToClearLogs);
        return;
      }

      await fetchOverview(true);
    } catch {
      toast.error(t.admin.toasts.failedToClearLogs);
    } finally {
      setClearingLogs(false);
    }
  }, [clearingLogs, authUser, fetchOverview]);

  const handleRetryJob = useCallback(
    async (jobId: string) => {
      if (!authUser || retryingJobs.has(jobId)) return;
      setRetryingJobs((prev) => new Set(prev).add(jobId));
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/admin/email-jobs/${jobId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          toast.error('Failed to re-queue job');
          return;
        }
        toast.success('Job re-queued for retry');
        await fetchOverview(true);
      } catch {
        toast.error('Failed to re-queue job');
      } finally {
        setRetryingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [authUser, retryingJobs, fetchOverview],
  );

  const cards = useMemo(() => {
    const counts = data?.counts;
    return [
      {
        label: 'Backlog',
        value: data?.backlog ?? 0,
        tone: 'text-amber-600 dark:text-amber-300',
        spinning: false,
      },
      {
        label: 'Pending',
        value: counts?.pending ?? 0,
        tone: 'text-blue-600 dark:text-blue-300',
        spinning: false,
      },
      {
        label: 'Processing',
        value: counts?.processing ?? 0,
        tone: 'text-amber-600 dark:text-amber-300',
        spinning: (counts?.processing ?? 0) > 0,
      },
      {
        label: 'Retrying',
        value: counts?.retrying ?? 0,
        tone: 'text-orange-600 dark:text-orange-300',
        spinning: false,
      },
      {
        label: 'Failed',
        value: counts?.failed ?? 0,
        tone: 'text-red-600 dark:text-red-300',
        spinning: false,
      },
      {
        label: 'Done',
        value: counts?.done ?? 0,
        tone: 'text-green-600 dark:text-green-300',
        spinning: false,
      },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Email Jobs Queue</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Real-time queue visibility every {Math.round(REFRESH_MS / 1000)}s.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefreshing(true);
                  fetchOverview(true);
                }}
                disabled={loading || refreshing}
              >
                <RefreshCw className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button size="sm" onClick={handleProcessNow} loading={processingNow}>
                <Play />
                Process now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="jobs-realtime-toggle"
              className="inline-flex items-center gap-2 px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300"
            >
              <Switch
                id="jobs-realtime-toggle"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Enable realtime refresh"
              />
              <span>Realtime: {autoRefresh ? 'ON' : 'OFF'}</span>
            </label>
            <Badge variant="info">Last update: {formatDate(data?.latestUpdatedAt ?? null)}</Badge>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {cards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                  {card.spinning && (
                    <Spinner className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
                  )}
                </div>
                <p className={`text-xl font-bold ${card.tone}`}>{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Mailgun Inbound Webhook Requests</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Raw inbound request snapshots from Mailgun webhook calls.
              </p>
            </div>
            <label
              htmlFor="mailgun-webhook-logging-toggle"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300"
            >
              <Switch
                id="mailgun-webhook-logging-toggle"
                checked={Boolean(data?.webhookLoggingEnabled)}
                onCheckedChange={handleToggleWebhookLogging}
                aria-label="Enable Mailgun webhook request logging"
                disabled={loading || loggingSaving}
              />
              <span>
                Save webhook logs: {data?.webhookLoggingEnabled ? 'ON' : 'OFF'}
                {loggingSaving ? ' (saving...)' : ''}
              </span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearWebhookLogs}
              disabled={loading || clearingLogs || !data || data.recentWebhookRequests.length === 0}
              loading={clearingLogs}
            >
              <Trash2 />
              Clear all logs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading webhook requests…</p>
          ) : data && data.recentWebhookRequests.length > 0 ? (
            <div className="space-y-2">
              {data.recentWebhookRequests.map((row) => (
                <WebhookLogRow key={row.id} row={row} getIdToken={getIdToken} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No inbound webhook requests logged yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Failed Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading queue details…</p>
          ) : data && data.recentFailures.length > 0 ? (
            <div className="space-y-2">
              {data.recentFailures.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="error">failed</Badge>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(row.updatedAt)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      attempts: {row.attempts}
                    </span>
                    {row.logId ? (
                      <a
                        className="text-xs text-blue-600 underline dark:text-blue-300"
                        href={`/email/original/${row.logId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        open email
                      </a>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-6 px-2 text-xs"
                      onClick={() => handleRetryJob(row.id)}
                      loading={retryingJobs.has(row.id)}
                      disabled={retryingJobs.has(row.id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {row.subject}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">from {row.sender}</p>
                  {row.userEmail ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      to user {row.userEmail}
                    </p>
                  ) : null}
                  <p className="mt-2 break-all text-xs text-red-700 dark:text-red-300">
                    <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5" />
                    {compactError(row.error)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No failed jobs in the recent queue history.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
