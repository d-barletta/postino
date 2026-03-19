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
import type { Stats } from '@/types';

interface AdminOverviewChartsProps {
  stats: Stats;
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  active: { label: 'Active', color: '#0891b2' },
  suspended: { label: 'Suspended', color: '#f59e0b' },
} satisfies ChartConfig;

export function AdminOverviewCharts({ stats }: AdminOverviewChartsProps) {
  const suspendedUsers = Math.max(stats.totalUsers - stats.activeUsers, 0);

  const outcomesData = [
    { name: 'Received', received: stats.totalEmailsReceived },
    { name: 'Forwarded', forwarded: stats.totalEmailsForwarded },
    { name: 'Error', error: stats.totalEmailsError },
  ];

  const userSplitData = [
    { name: 'Active', value: stats.activeUsers, fill: 'var(--color-active)' },
    { name: 'Suspended', value: suspendedUsers, fill: 'var(--color-suspended)' },
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
          <CardTitle>Email Outcomes</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig}>
            <BarChart data={outcomesData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="received" radius={8} fill="var(--color-received)" />
              <Bar dataKey="forwarded" radius={8} fill="var(--color-forwarded)" />
              <Bar dataKey="error" radius={8} fill="var(--color-error)" />
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
          <CardTitle>User Activity Split</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig} className="h-56 sm:h-65">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={userSplitData}
                dataKey="value"
                nameKey="name"
                innerRadius={44}
                outerRadius={78}
                strokeWidth={0}
              >
                {userSplitData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {userSplitData.map((entry) => (
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
