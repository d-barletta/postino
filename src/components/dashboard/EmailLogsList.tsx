'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { formatDate, truncate } from '@/lib/utils';
import { RefreshCw, ChevronLeft, ChevronRight, Mail, ExternalLink } from 'lucide-react';
import type { EmailLog } from '@/types';

const PAGE_SIZE = 10;

interface EmailLogsListProps {
  logs: EmailLog[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'processing', label: 'Processing' },
  { value: 'forwarded', label: 'Forwarded' },
  { value: 'error', label: 'Error' },
];

export function EmailLogsList({ logs, onRefresh, refreshing = false }: EmailLogsListProps) {
  const [selected, setSelected] = useState<EmailLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const filteredLogs = statusFilter ? logs.filter((l) => l.status === statusFilter) : logs;
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    if (currentPage > Math.max(1, totalPages)) {
      setCurrentPage(1);
    }
  }, [filteredLogs, currentPage, totalPages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelected(null);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Email History</CardTitle>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Combobox
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onValueChange={handleStatusFilter}
                  placeholder="Filter by status"
                  searchPlaceholder="Search status..."
                  clearable
                />
              </div>
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRefresh}
                  disabled={refreshing}
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              {statusFilter ? (
                <>
                  <p>No emails with status &ldquo;{statusFilter}&rdquo;.</p>
                  <button
                    onClick={() => handleStatusFilter('')}
                    className="text-sm mt-2 text-[#a3891f] dark:text-[#f3df79] hover:underline"
                  >
                    Clear filter
                  </button>
                </>
              ) : (
                <>
                  <p>No emails processed yet.</p>
                  <p className="text-sm mt-1">Send an email to your Postino address to get started!</p>
                </>
              )}
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
                      <div className="min-w-0 flex items-start gap-2">
                        <Mail className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{log.subject}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">From: {log.fromAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                        <Badge variant={statusVariant[log.status] || 'default'}>{log.status}</Badge>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt)}</span>
                      </div>
                    </div>
                    {selected?.id === log.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2 pl-6">
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
                          <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50/80 dark:bg-gray-800/70 rounded-lg p-3 max-h-32 overflow-y-auto">
                            {truncate(log.processedBody.replace(/<[^>]*>/g, '').replace(/</g, ''), 300)}
                          </div>
                        )}
                        <div className="pt-1">
                          <Link
                            href={`/email/original/${log.id}`}
                            className="inline-flex items-center gap-1.5 text-xs text-[#d0b53f] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
