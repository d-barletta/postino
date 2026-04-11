'use client';

import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/Accordion';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/Chart';
import type { Stats } from '@/types';

type TimeRange = '24h' | '7d' | '30d';
type TimeGranularity = 'hour' | 'day' | 'week';

interface TimeseriesBucket {
  bucket: string;
  received: number;
  processing: number;
  forwarded: number;
  error: number;
  skipped: number;
  cost: number;
}

interface AdminOverviewChartsProps {
  stats: Stats;
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  processing: { label: 'Processing', color: '#f59e0b' },
  skipped: { label: 'Skipped', color: '#6b7280' },
  cost: { label: 'Cost', color: '#8b5cf6' },
  active: { label: 'Active', color: '#0891b2' },
  suspended: { label: 'Suspended', color: '#e879f9' },
} satisfies ChartConfig;

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

function formatBucket(bucket: string, granularity: TimeGranularity): string {
  const date = new Date(bucket);
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse h-56 flex items-end gap-1.5 px-2 pb-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-t"
          style={{ height: `${25 + ((i * 19) % 65)}%` }}
        />
      ))}
    </div>
  );
}

const COST_COLOR_DARK = '#efd957';

export function AdminOverviewCharts({ stats }: AdminOverviewChartsProps) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const [range, setRange] = useState<TimeRange>('7d');
  const [granularity, setGranularity] = useState<TimeGranularity>(DEFAULT_GRANULARITY['7d']);
  const [buckets, setBuckets] = useState<TimeseriesBucket[]>([]);
  const [timeseriesLoading, setTimeseriesLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const fetchTimeseries = useCallback(async () => {
    if (!authUser) return;
    setTimeseriesLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch(
        `/api/admin/stats/timeseries?range=${range}&granularity=${granularity}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setBuckets(data.buckets || []);
      } else {
        toast.error(t.admin.toasts.failedToLoadChartData);
      }
    } finally {
      setTimeseriesLoading(false);
    }
  }, [authUser, range, granularity]);

  useEffect(() => {
    fetchTimeseries();
  }, [fetchTimeseries]);

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    if (!AVAILABLE_GRANULARITIES[newRange].includes(granularity)) {
      setGranularity(DEFAULT_GRANULARITY[newRange]);
    }
  };

  const suspendedUsers = Math.max(stats.totalUsers - stats.activeUsers, 0);

  const userSplitData = [
    { name: 'Active', value: stats.activeUsers, fill: 'var(--color-active)' },
    { name: 'Suspended', value: suspendedUsers, fill: 'var(--color-suspended)' },
  ];

  const chartData = buckets.map((b) => ({
    ...b,
    label: formatBucket(b.bucket, granularity),
  }));

  const btnBase = 'px-3 py-1 text-xs transition-colors';
  const btnActive = `bg-[#efd957] dark:bg-[#efd957] text-black dark:text-black font-semibold`;
  const btnInactive =
    'bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/10';
  const btnBorder = 'border-l border-gray-200 dark:border-gray-700';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Accordion type="single" collapsible defaultValue="email-outcomes">
          <AccordionItem value="email-outcomes" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              Email Outcomes
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
                {/* Controls */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {(['24h', '7d', '30d'] as TimeRange[]).map((r, idx) => (
                      <button
                        key={r}
                        onClick={() => handleRangeChange(r)}
                        className={`${btnBase} ${range === r ? btnActive : btnInactive} ${idx > 0 ? btnBorder : ''}`}
                      >
                        {RANGE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {AVAILABLE_GRANULARITIES[range].map((g, idx) => (
                      <button
                        key={g}
                        onClick={() => setGranularity(g)}
                        className={`${btnBase} ${granularity === g ? btnActive : btnInactive} ${idx > 0 ? btnBorder : ''}`}
                      >
                        {GRANULARITY_LABELS[g]}
                      </button>
                    ))}
                  </div>
                </div>

                {timeseriesLoading ? (
                  <ChartSkeleton />
                ) : (
                  <>
                    <ChartContainer config={chartConfig} className="h-56 sm:h-65">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          yAxisId="count"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={30}
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          yAxisId="cost"
                          orientation="right"
                          tickLine={false}
                          axisLine={false}
                          width={54}
                          tick={{ fontSize: 11 }}
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
                        <Bar
                          yAxisId="count"
                          dataKey="received"
                          stackId="s"
                          radius={0}
                          fill="var(--color-received)"
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="count"
                          dataKey="processing"
                          stackId="s"
                          radius={0}
                          fill="var(--color-processing)"
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="count"
                          dataKey="forwarded"
                          stackId="s"
                          radius={0}
                          fill="var(--color-forwarded)"
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="count"
                          dataKey="skipped"
                          stackId="s"
                          radius={0}
                          fill="var(--color-skipped)"
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="count"
                          dataKey="error"
                          stackId="s"
                          radius={[2, 2, 0, 0]}
                          fill="var(--color-error)"
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="cost"
                          type="monotone"
                          dataKey="cost"
                          stroke={isDarkMode ? COST_COLOR_DARK : 'var(--color-cost)'}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: isDarkMode ? COST_COLOR_DARK : 'var(--color-cost)' }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ChartContainer>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                      {(['received', 'forwarded', 'processing', 'error', 'skipped'] as const).map(
                        (key) => (
                          <span key={key} className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: chartConfig[key].color }}
                              aria-hidden
                            />
                            {chartConfig[key].label}
                          </span>
                        ),
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-0.5 w-4 rounded-full"
                          style={{
                            backgroundColor: isDarkMode ? COST_COLOR_DARK : chartConfig.cost.color,
                          }}
                          aria-hidden
                        />
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

      <Card>
        <Accordion type="single" collapsible defaultValue="user-split">
          <AccordionItem value="user-split" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              User Activity Split
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-4 sm:px-6">
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
                      isAnimationActive={false}
                    >
                      {userSplitData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {userSplitData.map((entry) => (
                    <div
                      key={entry.name}
                      className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40"
                    >
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                          aria-hidden
                        />
                        <span>{entry.name}</span>
                      </div>
                      <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">
                        {entry.value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
