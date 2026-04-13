'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import type { UserStats } from '@/types';

interface MonthlyCreditsCardProps {
  stats: UserStats;
}

function toPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

export function MonthlyCreditsCard({ stats }: MonthlyCreditsCardProps) {
  const used = stats.monthlyCreditsUsed || 0;
  const limit = stats.monthlyCreditsLimit || 0;
  const remaining = Math.max(0, stats.monthlyCreditsRemaining || 0);
  const percent = toPercent(used, limit);

  const barColor = percent >= 90 ? 'bg-red-500' : percent >= 75 ? 'bg-orange-500' : 'bg-green-500';

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly Credits</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {used.toLocaleString(undefined, { maximumFractionDigits: 2 })} /{' '}
            {limit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Remaining: {remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
