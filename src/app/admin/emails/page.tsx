'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

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

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  received: 'info',
  processing: 'warning',
  forwarded: 'success',
  error: 'error',
};

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

export default function AdminEmailsPage() {
  const { firebaseUser } = useAuth();
  const [logs, setLogs] = useState<AdminEmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/emails?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setFetchError('');
      } else {
        setFetchError('Failed to load email logs.');
      }
    } catch {
      setFetchError('Failed to load email logs.');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLogs();
    } finally {
      setRefreshing(false);
    }
  }, [fetchLogs]);

  return (
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Logs</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Details of all emails processed by Postino</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Processed Emails</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={loading || refreshing}
                title="Refresh"
                className="text-gray-400 hover:text-[#d0b53f] dark:hover:text-[#f3df79] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className={`bi bi-arrow-clockwise text-lg${refreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
              </button>
              {!loading && (
                <span className="text-sm text-gray-500 dark:text-gray-400">{logs.length} records</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading email logs...</div>
          ) : fetchError ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">{fetchError}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">No emails processed yet.</div>
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
                  {logs.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-yellow-50/60 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors"
                        onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(log.receivedAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="max-w-[140px] truncate" title={log.userEmail || log.userId}>
                            {log.userEmail || log.userId}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          <div className="max-w-[140px] truncate" title={log.fromAddress}>
                            {log.fromAddress}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-100">
                          <div className="max-w-[200px] truncate" title={log.subject}>
                            {log.subject}
                          </div>
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
                        <tr key={`${log.id}-detail`} className="bg-yellow-50/40 dark:bg-yellow-900/5">
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
                                  <dd className="text-red-600 dark:text-red-400 break-words">{log.errorMessage}</dd>
                                </div>
                              )}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
