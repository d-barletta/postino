'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate, truncate } from '@/lib/utils';
import type { EmailLog } from '@/types';

const PAGE_SIZE = 10;

interface EmailLogsListProps {
  logs: EmailLog[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function EmailLogsList({ logs, onRefresh, refreshing = false }: EmailLogsListProps) {
  const [selected, setSelected] = useState<EmailLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(logs.length / PAGE_SIZE);
  const paginatedLogs = logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (currentPage > Math.max(1, totalPages)) {
      setCurrentPage(1);
    }
  }, [logs, currentPage, totalPages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelected(null);
  };

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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Email History</h2>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                title="Refresh"
                className="text-gray-400 hover:text-[#d0b53f] dark:hover:text-[#f3df79] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className={`bi bi-arrow-clockwise text-lg${refreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <p>No emails processed yet.</p>
              <p className="text-sm mt-1">Send an email to your Postino address to get started!</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {paginatedLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors"
                    onClick={() => setSelected(selected?.id === log.id ? null : log)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{log.subject}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">From: {log.fromAddress}</p>
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
                            {truncate(log.processedBody.replace(/<[^>]*>/g, '').replace(/</g, ''), 300)}
                          </div>
                        )}
                        <div className="pt-1">
                          <Link
                            href={`/email/original/${log.id}`}
                            className="inline-flex items-center gap-1 text-xs text-[#d0b53f] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="bi bi-envelope-open" aria-hidden="true" />
                            View original email
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
