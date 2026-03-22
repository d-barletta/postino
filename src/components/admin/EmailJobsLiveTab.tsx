'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Play, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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
}

const REFRESH_MS = 5000;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function compactError(message: string, maxLen = 140): string {
  return message.length > maxLen ? `${message.slice(0, maxLen)}…` : message;
}

export default function EmailJobsLiveTab() {
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<JobsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingNow, setProcessingNow] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchOverview = useCallback(async (silent = false) => {
    if (!firebaseUser) return;
    if (!silent) setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/email-jobs', {
        headers: { Authorization: `Bearer ${token}` },
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
  }, [firebaseUser]);

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
    if (!firebaseUser) return;
    setProcessingNow(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/email-jobs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 20 }),
      });

      if (!res.ok) {
        setError('Failed to process queue batch');
        return;
      }

      await fetchOverview(true);
    } catch {
      setError('Failed to process queue batch');
    } finally {
      setProcessingNow(false);
    }
  }, [firebaseUser, fetchOverview]);

  const cards = useMemo(() => {
    const counts = data?.counts;
    return [
      { label: 'Backlog', value: data?.backlog ?? 0, tone: 'text-amber-600 dark:text-amber-300' },
      { label: 'Pending', value: counts?.pending ?? 0, tone: 'text-blue-600 dark:text-blue-300' },
      { label: 'Processing', value: counts?.processing ?? 0, tone: 'text-amber-600 dark:text-amber-300' },
      { label: 'Retrying', value: counts?.retrying ?? 0, tone: 'text-orange-600 dark:text-orange-300' },
      { label: 'Failed', value: counts?.failed ?? 0, tone: 'text-red-600 dark:text-red-300' },
      { label: 'Done', value: counts?.done ?? 0, tone: 'text-green-600 dark:text-green-300' },
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                autoRefresh
                  ? 'border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
              }`}
            >
              Auto refresh: {autoRefresh ? 'ON' : 'OFF'}
            </button>
            <Badge variant="info">Last update: {formatDate(data?.latestUpdatedAt ?? null)}</Badge>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {cards.map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`text-xl font-bold ${card.tone}`}>{card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
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
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(row.updatedAt)}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">attempts: {row.attempts}</span>
                    {row.logId ? (
                      <a className="text-xs text-blue-600 underline dark:text-blue-300" href={`/email/original/${row.logId}`} target="_blank" rel="noreferrer">
                        open email
                      </a>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.subject}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">from {row.sender}</p>
                  {row.userEmail ? <p className="text-xs text-gray-500 dark:text-gray-400">to user {row.userEmail}</p> : null}
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                    <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5" />
                    {compactError(row.error)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No failed jobs in the recent queue history.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
