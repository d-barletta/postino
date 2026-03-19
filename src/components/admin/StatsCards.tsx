import { Card, CardContent } from '@/components/ui/Card';
import type { Stats } from '@/types';

interface StatsCardsProps {
  stats: Stats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'text-[#b39623] dark:text-[#f1db72]' },
    { label: 'Active Users', value: stats.activeUsers, color: 'text-green-600 dark:text-green-400' },
    { label: 'Emails Received', value: stats.totalEmailsReceived, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Emails Forwarded', value: stats.totalEmailsForwarded, color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Emails Errored', value: stats.totalEmailsError, color: 'text-red-600 dark:text-red-400' },
    { label: 'Emails Skipped', value: stats.totalEmailsSkipped, color: 'text-gray-500 dark:text-gray-400' },
    {
      label: 'Tokens Used',
      value: stats.totalTokensUsed.toLocaleString(),
      color: 'text-[#b39623] dark:text-[#f1db72]',
    },
    {
      label: 'Est. Total Cost',
      value: `$${stats.totalEstimatedCost.toFixed(4)}`,
      color: 'text-gray-700 dark:text-gray-200',
    },
  ];

  return (
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
  );
}
