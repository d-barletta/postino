'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate, truncate } from '@/lib/utils';
import type { EmailLog } from '@/types';

export function EmailLogsList() {
  const { firebaseUser } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailLog | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/email/logs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [firebaseUser]);

  const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
    received: 'info',
    processing: 'warning',
    forwarded: 'success',
    error: 'error',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Email History</h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">Loading emails...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <p>No emails processed yet.</p>
              <p className="text-sm mt-1">Send an email to your Postino address to get started!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors"
                  onClick={() => setSelected(selected?.id === log.id ? null : log)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{log.subject}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">From: {log.fromAddress}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={statusVariant[log.status] || 'default'}>{log.status}</Badge>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt)}</span>
                    </div>
                  </div>
                  {selected?.id === log.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                      {log.ruleApplied && (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-medium">Rule applied:</span> {log.ruleApplied}
                        </p>
                      )}
                      {log.tokensUsed !== undefined && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tokens: {log.tokensUsed} | Est. cost: ${(log.estimatedCost || 0).toFixed(5)}
                        </p>
                      )}
                      {log.processedBody && (
                        <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/70 rounded p-2 max-h-32 overflow-y-auto">
                          {truncate(log.processedBody.replace(/<[^>]*>/g, ''), 300)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
