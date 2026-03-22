'use client';

import { useEffect, useState } from 'react';
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
  loading?: boolean;
}

type TimeRange = '24h' | '7d' | '30d';

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  processing: { label: 'Processing', color: '#f59e0b' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  skipped: { label: 'Skipped', color: '#6b7280' },
  tokens: { label: 'Tokens', color: '#0ea5e9' },
  cost: { label: 'Cost', color: '#8b5cf6' },
} satisfies ChartConfig;

const STATUS_ORDER = ['received', 'processing', 'forwarded', 'error', 'skipped'] as const;

type TimeGranularity = 'hour' | 'day' | 'week';

const RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const GRANULARITY_LABELS: Record<TimeGranularity, string> = {
  hour: 'Per Hour',
  day: 'Per Day',
  week: 'Per Week',
};

const AVAILABLE_GRANULARITIES: Record<TimeRange, TimeGranularity[]> = {
  '24h': ['hour', 'day'],
  '7d': ['hour', 'day', 'week'],
  '30d': ['day', 'week'],
};

const DEFAULT_GRANULARITY: Record<TimeRange, TimeGranularity> = {
  '24h': 'hour',
  '7d': 'day',
  '30d': 'day',
};

function getRangeCutoff(range: TimeRange): number {
  const now = Date.now();
  if (range === '24h') return now - 24 * 60 * 60 * 1000;
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function formatBucket(bucket: string, granularity: TimeGranularity): string {
  const date = new Date(bucket);
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (granularity === 'week') {
    return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getBucketKey(iso: string | null, granularity: TimeGranularity): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (granularity === 'hour') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).toISOString();
  }
  if (granularity === 'week') {
    const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()).toISOString();
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function ChartSkeleton({ height = 'h-56' }: { height?: string }) {
  return (
    <div className={`animate-pulse ${height} flex items-end gap-2 px-2 pb-2`}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-t"
          style={{ height: `${30 + ((i * 17) % 60)}%` }}
        />
      ))}
    </div>
  );
}

export function EmailLogsCharts({ logs, loading }: EmailLogsChartsProps) {
  const [range, setRange] = useState<TimeRange>('7d');
  const [granularity, setGranularity] = useState<TimeGranularity>(DEFAULT_GRANULARITY['7d']);
  const [statusAccordionValue, setStatusAccordionValue] = useState('');
  const [tokensAccordionValue, setTokensAccordionValue] = useState('tokens-cost');
  const [isMobile, setIsMobile] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    if (!AVAILABLE_GRANULARITIES[newRange].includes(granularity)) {
      setGranularity(DEFAULT_GRANULARITY[newRange]);
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');

    const syncViewportState = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);

      // On desktop, keep both accordions always expanded.
      if (!mobile) {
        setStatusAccordionValue('status-distribution');
        setTokensAccordionValue('tokens-cost');
      }
    };

    syncViewportState();

    mediaQuery.addEventListener('change', syncViewportState);
    return () => mediaQuery.removeEventListener('change', syncViewportState);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

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
  const cutoff = getRangeCutoff(range);
  const logsInRange = logs.filter((log) => {
    if (!log.receivedAt) return false;
    const ts = new Date(log.receivedAt).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  const bucketMap = new Map<string, { tokens: number; cost: number }>();
  for (const log of logsInRange) {
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
        <Accordion type="single" collapsible={isMobile} value={statusAccordionValue} onValueChange={setStatusAccordionValue}>
          <AccordionItem value="status-distribution" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              Status Distribution
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
                {loading ? (
                  <ChartSkeleton height="h-56 sm:h-65" />
                ) : (
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
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {byStatus.map((item) => {
                    const statusKey = item.status as keyof typeof chartConfig;
                    return (
                      <div key={item.status} className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartConfig[statusKey]?.color }} aria-hidden />
                          <span>{chartConfig[statusKey]?.label ?? item.status}</span>
                        </div>
                        {loading ? (
                          <div className="mt-0.5 h-4 w-8 animate-pulse bg-gray-200 dark:bg-gray-700 rounded" />
                        ) : (
                          <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">{item.count.toLocaleString()}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <Card>
        <Accordion type="single" collapsible={isMobile} value={tokensAccordionValue} onValueChange={setTokensAccordionValue}>
          <AccordionItem value="tokens-cost" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              Tokens and estimated Cost
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <>
                    <div className="mb-8 flex flex-wrap items-center gap-3">
                      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                        {(['24h', '7d', '30d'] as TimeRange[]).map((r, idx) => (
                          <button
                            key={r}
                            onClick={() => handleRangeChange(r)}
                            className={`px-3 py-1 transition-colors ${
                              range === r
                                ? 'bg-[#EFD957] text-black font-semibold'
                                : 'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'
                            } ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
                          >
                            {RANGE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                        {AVAILABLE_GRANULARITIES[range].map((g, idx) => (
                          <button
                            key={g}
                            onClick={() => setGranularity(g)}
                            className={`px-3 py-1 transition-colors ${
                              granularity === g
                                ? 'bg-[#EFD957] text-black font-semibold'
                                : 'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'
                            } ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
                          >
                            {GRANULARITY_LABELS[g]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ChartContainer config={chartConfig} className="h-75 sm:h-85">
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
                          stroke={isDarkMode ? '#EFD957' : 'var(--color-cost)'}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: isDarkMode ? '#EFD957' : 'var(--color-cost)' }}
                          activeDot={{ r: 5, fill: isDarkMode ? '#EFD957' : 'var(--color-cost)' }}
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
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
