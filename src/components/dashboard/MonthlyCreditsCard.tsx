'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { UserStats } from '@/types';

interface MonthlyCreditsCardProps {
  stats: UserStats;
  onRefresh?: () => Promise<void>;
}

function toPercent(remaining: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / limit) * 100));
}

export function MonthlyCreditsCard({ stats, onRefresh }: MonthlyCreditsCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const used = stats.monthlyCreditsUsed || 0;
  const limit = stats.monthlyCreditsLimit || 0;
  const remaining = Math.max(0, stats.monthlyCreditsRemaining || 0);
  const percent = toPercent(remaining, limit);

  const barColor = percent <= 10 ? 'bg-red-500' : percent <= 25 ? 'bg-orange-500' : 'bg-green-500';

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly Credits</h2>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh credits"
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
        )}
      </CardHeader>
      {refreshing ? (
        <CardContent className="space-y-3 animate-pulse">
          <div className="flex items-baseline justify-between gap-3">
            <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700" />
        </CardContent>
      ) : (
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {Math.ceil(used).toLocaleString()} / {Math.ceil(limit).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Remaining: {Math.round(percent)}%
            </p>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
