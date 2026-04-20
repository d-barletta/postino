'use client';

import { Card, CardContent } from '@/components/ui/Card';
import type { UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';

export type StatsPeriod = '24h' | '7d' | '30d' | 'all';

interface UserStatsCardsProps {
  stats: UserStats;
  period: StatsPeriod;
  onPeriodChange: (period: StatsPeriod) => void;
}

export function UserStatsCards({ stats, period, onPeriodChange }: UserStatsCardsProps) {
  const { t } = useI18n();
  const s = t.dashboard.stats;

  const PERIOD_LABELS: Record<StatsPeriod, string> = {
    '24h': s.last24h,
    '7d': s.last7days,
    '30d': s.lastMonth,
    all: s.allTime,
  };

  const cards = [
    {
      label: s.emailsReceived,
      value: stats.totalEmailsReceived,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: s.emailsForwarded,
      value: stats.totalEmailsForwarded,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: s.emailsErrored,
      value: stats.totalEmailsError,
      color: 'text-red-600 dark:text-red-400',
    },
    {
      label: s.emailsSkipped,
      value: stats.totalEmailsSkipped,
      color: 'text-orange-600 dark:text-orange-400',
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
              <p className={`text-xl font-bold truncate ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
