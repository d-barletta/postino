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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Email Outcomes</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <BarChart data={outcomesData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="received" radius={8} fill="var(--color-received)" />
              <Bar dataKey="forwarded" radius={8} fill="var(--color-forwarded)" />
              <Bar dataKey="error" radius={8} fill="var(--color-error)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Activity Split</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-65">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={userSplitData}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={90}
                strokeWidth={0}
              >
                {userSplitData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
