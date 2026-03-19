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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>My Email Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig}>
            <BarChart data={volumeData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" radius={8}>
                {volumeData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcome Ratio</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-65">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie
                data={ratioData}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={90}
                strokeWidth={0}
              >
                {ratioData.map((entry) => (
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
