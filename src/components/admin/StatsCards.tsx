'use client';

import { Card, CardContent } from '@/components/ui/Card';
import type { Stats } from '@/types';
import { useI18n } from '@/lib/i18n';

export type StatsPeriod = '24h' | '7d' | '30d' | 'all';

interface StatsCardsProps {
  stats: Stats;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export function StatsCards({ stats, period, onPeriodChange }: StatsCardsProps) {
  const { t } = useI18n();
  const s = t.dashboard.stats;

  const PERIOD_LABELS: Record<StatsPeriod, string> = {
    '24h': s.last24h,
    '7d': s.last7days,
    '30d': s.lastMonth,
    all: s.allTime,
  };

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'text-[#b39623] dark:text-[#f1db72]' },
    {
      label: 'Active Users',
      value: stats.activeUsers,
      color: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Emails Received',
      value: stats.totalEmailsReceived,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Emails Forwarded',
      value: stats.totalEmailsForwarded,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Emails Errored',
      value: stats.totalEmailsError,
      color: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'Emails Skipped',
      value: stats.totalEmailsSkipped,
      color: 'text-gray-500 dark:text-gray-400',
    },
    {
      label: 'Tokens Used',
      value: stats.totalTokensUsed.toLocaleString(),
      color: 'text-[#b39623] dark:text-[#f1db72]',
    },
    {
      label: 'Total Credits Used',
      value: stats.totalCreditsUsed.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      color: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: 'Real Total Cost',
      value: `$${stats.totalEstimatedCost.toFixed(4)}`,
      color: 'text-gray-700 dark:text-gray-200',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-gray-700">
          {(['all', '30d', '7d', '24h'] as StatsPeriod[]).map((p, idx) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 transition-colors ${
                period === p
                  ? 'bg-[#efd957] font-semibold text-black'
                  : 'bg-white/60 text-gray-600 hover:bg-yellow-50 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:bg-yellow-900/10'
              } ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
