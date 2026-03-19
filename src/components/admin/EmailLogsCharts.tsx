import { Bar, BarChart, Cell, Pie, PieChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/Chart';

interface AdminEmailLogChartItem {
  id: string;
  status: string;
  tokensUsed: number | null;
  estimatedCost: number | null;
}

interface EmailLogsChartsProps {
  logs: AdminEmailLogChartItem[];
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  processing: { label: 'Processing', color: '#f59e0b' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  tokens: { label: 'Tokens', color: '#0ea5e9' },
  cost: { label: 'Cost', color: '#8b5cf6' },
} satisfies ChartConfig;

const STATUS_ORDER = ['received', 'processing', 'forwarded', 'error'] as const;

export function EmailLogsCharts({ logs }: EmailLogsChartsProps) {
  const byStatus = STATUS_ORDER.map((status) => {
    const statusLogs = logs.filter((log) => log.status === status);
    const totalTokens = statusLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
    const totalCost = statusLogs.reduce((sum, log) => sum + (log.estimatedCost || 0), 0);

    return {
      status,
      count: statusLogs.length,
      tokens: totalTokens,
      cost: Number(totalCost.toFixed(5)),
      fill: `var(--color-${status})`,
    };
  });

  const pieData = byStatus.filter((item) => item.count > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig} className="h-56 sm:h-65">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => Number(v || 0).toLocaleString()} />} />
              <Pie
                data={pieData.length > 0 ? pieData : [{ status: 'received', count: 0, fill: 'var(--color-received)' }]}
                dataKey="count"
                nameKey="status"
                innerRadius={44}
                outerRadius={78}
                strokeWidth={0}
              >
                {(pieData.length > 0 ? pieData : [{ status: 'received', fill: 'var(--color-received)' }]).map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {byStatus.map((item) => (
              <div key={item.status} className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartConfig[item.status].color }} aria-hidden />
                  <span>{chartConfig[item.status].label}</span>
                </div>
                <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{item.count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tokens by Status</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig}>
            <BarChart data={byStatus} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="status" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => Number(v || 0).toLocaleString()} />} />
              <Bar dataKey="tokens" radius={8} fill="var(--color-tokens)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimated Cost by Status</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3 sm:px-6 sm:py-4">
          <ChartContainer config={chartConfig}>
            <BarChart data={byStatus} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="status" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 12 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => `$${Number(v || 0).toFixed(5)}`} />} />
              <Bar dataKey="cost" radius={8} fill="var(--color-cost)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
