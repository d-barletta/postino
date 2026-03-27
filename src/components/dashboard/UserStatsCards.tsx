'use client';

import { Card, CardContent } from '@/components/ui/Card';
import type { UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';

interface UserStatsCardsProps {
  stats: UserStats;
}

export function UserStatsCards({ stats }: UserStatsCardsProps) {
  const { t } = useI18n();
  const s = t.dashboard.stats;

  const cards = [
    { label: s.emailsReceived, value: stats.totalEmailsReceived, color: 'text-blue-600 dark:text-blue-400' },
    { label: s.emailsForwarded, value: stats.totalEmailsForwarded, color: 'text-purple-600 dark:text-purple-400' },
    { label: s.emailsErrored, value: stats.totalEmailsError, color: 'text-red-600 dark:text-red-400' },
    { label: s.emailsSkipped, value: stats.totalEmailsSkipped, color: 'text-gray-500 dark:text-gray-400' },
    {
      label: s.tokensUsed,
      value: stats.totalTokensUsed.toLocaleString(),
      color: 'text-[#b39623] dark:text-[#f1db72]',
    },
    {
      label: s.estCost,
      value: `$${stats.totalEstimatedCost.toFixed(4)}`,
      color: 'text-gray-700 dark:text-gray-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
