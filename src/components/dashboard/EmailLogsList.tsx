'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { formatDate, truncate } from '@/lib/utils';
import { RefreshCw, ChevronLeft, ChevronRight, Mail, ExternalLink } from 'lucide-react';
import type { EmailLog } from '@/types';

const PAGE_SIZE = 10;
const ALL_STATUS_VALUE = '__all__';

interface EmailLogsListProps {
  logs: EmailLog[];
  onRefresh?: () => void;
  refreshing?: boolean;
  selectedEmailId?: string;
}

const STATUS_OPTIONS = [
  { value: ALL_STATUS_VALUE, label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'processing', label: 'Processing' },
  { value: 'forwarded', label: 'Forwarded' },
  { value: 'error', label: 'Error' },
  { value: 'skipped', label: 'Skipped' },
];

export function EmailLogsList({
  logs,
  onRefresh,
  refreshing = false,
  selectedEmailId,
}: EmailLogsListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const effectiveStatusFilter = selectedEmailId ? '' : statusFilter;

  const filteredLogs = effectiveStatusFilter
    ? logs.filter((l) => l.status === effectiveStatusFilter)
    : logs;

  const deepLinkedIndex = selectedEmailId
    ? filteredLogs.findIndex((l) => l.id === selectedEmailId)
    : -1;
  const deepLinkedPage =
    selectedEmailId && selectedId === selectedEmailId && deepLinkedIndex >= 0
      ? Math.floor(deepLinkedIndex / PAGE_SIZE) + 1
      : null;

  const effectiveCurrentPage = deepLinkedPage ?? currentPage;
  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
  const safeCurrentPage = Math.min(Math.max(1, effectiveCurrentPage), Math.max(1, totalPages));
  const paginatedLogs = filteredLogs.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedId(null);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
    setSelectedId(null);
  };

  const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
    received: 'info',
    processing: 'warning',
    forwarded: 'success',
    error: 'error',
    skipped: 'default',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Email History</CardTitle>
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select
                  value={statusFilter || ALL_STATUS_VALUE}
                  onValueChange={(value) =>
                    handleStatusFilter(value === ALL_STATUS_VALUE ? '' : value)
                  }
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
                    className={`px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors ${selectedId === log.id ? 'bg-yellow-50/70 dark:bg-yellow-900/10' : ''}`}
                    onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                      <div className="min-w-0 flex items-start gap-2">
                        <Mail className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">{log.subject}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 wrap-break-word">From: {log.fromAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                        <Badge variant={statusVariant[log.status] || 'default'}>{log.status}</Badge>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt)}</span>
                      </div>
                    </div>
                    {selectedId === log.id && (
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
                    disabled={safeCurrentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Page {safeCurrentPage} of {Math.max(1, totalPages)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(Math.min(Math.max(1, totalPages), safeCurrentPage + 1))}
                    disabled={safeCurrentPage === Math.max(1, totalPages)}
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
