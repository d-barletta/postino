'use client';

import { useState } from 'react';
import { Bar, Cell, Pie, PieChart, CartesianGrid, XAxis, YAxis, ComposedChart, Line } from 'recharts';
import { Card } from '@/components/ui/Card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/Chart';

interface AdminEmailLogChartItem {
  id: string;
  status: string;
  tokensUsed: number | null;
  estimatedCost: number | null;
  receivedAt: string | null;
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

type TimeGranularity = 'hour' | 'day';

function formatBucket(bucket: string, granularity: TimeGranularity): string {
  const date = new Date(bucket);
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getBucketKey(iso: string | null, granularity: TimeGranularity): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (granularity === 'hour') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).toISOString();
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

export function EmailLogsCharts({ logs }: EmailLogsChartsProps) {
  const [granularity, setGranularity] = useState<TimeGranularity>('hour');

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

  // Build time-bucketed data for tokens/cost chart
  const bucketMap = new Map<string, { tokens: number; cost: number }>();
  for (const log of logs) {
    const key = getBucketKey(log.receivedAt, granularity);
    const existing = bucketMap.get(key) ?? { tokens: 0, cost: 0 };
    bucketMap.set(key, {
      tokens: existing.tokens + (log.tokensUsed || 0),
      cost: existing.cost + (log.estimatedCost || 0),
    });
  }

  const timeData = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, { tokens, cost }]) => ({
      label: formatBucket(bucket, granularity),
      tokens,
      cost: Number(cost.toFixed(5)),
    }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <Accordion type="single" collapsible defaultValue="status-distribution">
          <AccordionItem value="status-distribution" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              Status Distribution
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
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
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <Card>
        <Accordion type="single" collapsible defaultValue="tokens-cost">
          <AccordionItem value="tokens-cost" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              Tokens and Estimated Cost
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Group by:</span>
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                    <button
                      onClick={() => setGranularity('hour')}
                      className={`px-3 py-1 transition-colors ${
                        granularity === 'hour'
                          ? 'bg-[#EFD957] text-gray-900 font-semibold'
                          : 'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'
                      }`}
                    >
                      Per Hour
                    </button>
                    <button
                      onClick={() => setGranularity('day')}
                      className={`px-3 py-1 transition-colors border-l border-gray-200 dark:border-gray-700 ${
                        granularity === 'day'
                          ? 'bg-[#EFD957] text-gray-900 font-semibold'
                          : 'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'
                      }`}
                    >
                      Per Day
                    </button>
                  </div>
                </div>
                <ChartContainer config={chartConfig}>
                  <ComposedChart data={timeData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis yAxisId="tokens" allowDecimals={false} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 12 }} />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={54}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) =>
                            String(name) === 'cost'
                              ? `$${Number(value || 0).toFixed(5)}`
                              : Number(value || 0).toLocaleString()
                          }
                        />
                      }
                    />
                    <Bar yAxisId="tokens" dataKey="tokens" radius={0} fill="var(--color-tokens)" />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="cost"
                      stroke="var(--color-cost)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: 'var(--color-cost)' }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ChartContainer>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
                    Tokens (bar)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-violet-500" aria-hidden />
                    Cost (line)
                  </span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
