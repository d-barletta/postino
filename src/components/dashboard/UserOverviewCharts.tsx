import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/Chart';
import type { UserStats } from '@/types';

interface UserOverviewChartsProps {
  stats: UserStats;
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  pending: { label: 'Pending', color: '#f59e0b' },
} satisfies ChartConfig;

export function UserOverviewCharts({ stats }: UserOverviewChartsProps) {
  const pending = Math.max(stats.totalEmailsReceived - stats.totalEmailsForwarded - stats.totalEmailsError, 0);

  const volumeData = [
    { name: 'Received', value: stats.totalEmailsReceived, fill: 'var(--color-received)' },
    { name: 'Forwarded', value: stats.totalEmailsForwarded, fill: 'var(--color-forwarded)' },
    { name: 'Error', value: stats.totalEmailsError, fill: 'var(--color-error)' },
  ];

  const ratioData = [
    { name: 'Forwarded', value: stats.totalEmailsForwarded, fill: 'var(--color-forwarded)' },
    { name: 'Error', value: stats.totalEmailsError, fill: 'var(--color-error)' },
    { name: 'Pending', value: pending, fill: 'var(--color-pending)' },
  ];

  const legendItems = [
    { key: 'received', label: 'Received', value: stats.totalEmailsReceived },
    { key: 'forwarded', label: 'Forwarded', value: stats.totalEmailsForwarded },
    { key: 'error', label: 'Error', value: stats.totalEmailsError },
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>My Email Volume</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig}>
            <BarChart data={volumeData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" radius={8}>
                {volumeData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {legendItems.map((item) => (
              <div key={item.key} className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartConfig[item.key].color }} aria-hidden />
                  <span>{item.label}</span>
                </div>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{item.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcome Ratio</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig} className="h-56 sm:h-65">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={ratioData}
                dataKey="value"
                nameKey="name"
                innerRadius={44}
                outerRadius={78}
                strokeWidth={0}
              >
                {ratioData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {ratioData.map((entry) => (
              <div key={entry.name} className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.fill }} aria-hidden />
                  <span>{entry.name}</span>
                </div>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{entry.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
