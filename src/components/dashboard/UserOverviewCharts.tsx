 'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/Chart';
import type { EmailLog, UserStats } from '@/types';

interface UserOverviewChartsProps {
  stats: UserStats;
  logs: EmailLog[];
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  processing: { label: 'Processing', color: '#f59e0b' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
  skipped: { label: 'Skipped', color: '#6b7280' },
  cost: { label: 'Estimated Cost', color: '#8b5cf6' },
} satisfies ChartConfig;

type TimeGranularity = 'hour' | 'day';
type TimeRange = '24h' | '7d' | '30d';

const RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const GRANULARITY_LABELS: Record<TimeGranularity | 'week', string> = {
  hour: 'Per Hour',
  day: 'Per Day',
  week: 'Per Week',
};

const AVAILABLE_GRANULARITIES: Record<TimeRange, Array<TimeGranularity | 'week'>> = {
  '24h': ['hour', 'day'],
  '7d': ['hour', 'day', 'week'],
  '30d': ['day', 'week'],
};

const DEFAULT_GRANULARITY: Record<TimeRange, TimeGranularity | 'week'> = {
  '24h': 'hour',
  '7d': 'day',
  '30d': 'day',
};

type VolumePoint = {
  label: string;
  received: number;
  processing: number;
  forwarded: number;
  error: number;
  skipped: number;
  cost: number;
};

function normalizeStatus(status: string): 'received' | 'processing' | 'forwarded' | 'error' | 'skipped' {
  if (status === 'processing' || status === 'forwarded' || status === 'error' || status === 'skipped') {
    return status;
  }
  return 'received';
}

function getBucketStart(date: Date, granularity: TimeGranularity | 'week'): number {
  if (granularity === 'hour') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
  }
  if (granularity === 'week') {
    const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
    return new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()).getTime();
  }
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatBucketLabel(bucketStart: number, granularity: TimeGranularity | 'week'): string {
  const date = new Date(bucketStart);
  if (granularity === 'hour') {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (granularity === 'week') {
    return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getRangeCutoff(range: TimeRange): number {
  const now = Date.now();
  if (range === '24h') return now - 24 * 60 * 60 * 1000;
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function toDate(value: EmailLog['receivedAt']): Date | null {
  const parsed = new Date(value as unknown as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function UserOverviewCharts({ stats, logs }: UserOverviewChartsProps) {
  const [range, setRange] = useState<TimeRange>('7d');
  const [granularity, setGranularity] = useState<TimeGranularity | 'week'>(DEFAULT_GRANULARITY['7d']);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange);
    if (!AVAILABLE_GRANULARITIES[newRange].includes(granularity)) {
      setGranularity(DEFAULT_GRANULARITY[newRange]);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const volumeData = useMemo<VolumePoint[]>(() => {
    const buckets = new Map<number, VolumePoint>();
    const cutoff = getRangeCutoff(range);

    for (const log of logs) {
      const receivedAt = toDate(log.receivedAt);
      if (!receivedAt) continue;
      if (receivedAt.getTime() < cutoff) continue;

      const bucketStart = getBucketStart(receivedAt, granularity);
      const current = buckets.get(bucketStart) ?? {
        label: formatBucketLabel(bucketStart, granularity),
        received: 0,
        processing: 0,
        forwarded: 0,
        error: 0,
        skipped: 0,
        cost: 0,
      };

      const status = normalizeStatus(log.status);
      current[status] += 1;
      current.cost += log.estimatedCost || 0;
      buckets.set(bucketStart, current);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([, point]) => ({
        ...point,
        cost: Number(point.cost.toFixed(5)),
      }));
  }, [granularity, logs, range]);

  const legendItems = [
    { key: 'received', label: 'Received', value: stats.totalEmailsReceived },
    { key: 'processing', label: 'Processing', value: Math.max(stats.totalEmailsReceived - stats.totalEmailsForwarded - stats.totalEmailsError - stats.totalEmailsSkipped, 0) },
    { key: 'forwarded', label: 'Forwarded', value: stats.totalEmailsForwarded },
    { key: 'error', label: 'Error', value: stats.totalEmailsError },
    { key: 'skipped', label: 'Skipped', value: stats.totalEmailsSkipped },
    { key: 'cost', label: 'Est. Cost', value: `$${stats.totalEstimatedCost.toFixed(5)}` },
  ] as const;

  return (
    <Card>
      <Accordion type="single" collapsible defaultValue="volume">
        <AccordionItem value="volume" className="border-0">
          <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
            My Email Volume
          </AccordionTrigger>
          <AccordionContent>
            <div className="px-4 pb-4 sm:px-6">
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-gray-700">
                  {(['24h', '7d', '30d'] as TimeRange[]).map((r, idx) => (
                    <button
                      key={r}
                      onClick={() => handleRangeChange(r)}
                      className={`px-3 py-1 transition-colors ${
                        range === r
                          ? 'bg-[#EFD957] font-semibold text-black'
                          : 'bg-white/60 text-gray-600 hover:bg-yellow-50 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:bg-yellow-900/10'
                      } ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
                    >
                      {RANGE_LABELS[r]}
                    </button>
                  ))}
                </div>
                <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-gray-700">
                  {AVAILABLE_GRANULARITIES[range].map((g, idx) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-3 py-1 transition-colors ${
                        granularity === g
                          ? 'bg-[#EFD957] font-semibold text-black'
                          : 'bg-white/60 text-gray-600 hover:bg-yellow-50 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:bg-yellow-900/10'
                      } ${idx > 0 ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
                    >
                      {GRANULARITY_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
              <ChartContainer config={chartConfig}>
                <ComposedChart data={volumeData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="count" allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 12 }} />
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
                  <Bar yAxisId="count" dataKey="received" stackId="emails" radius={0} fill="var(--color-received)" />
                  <Bar yAxisId="count" dataKey="processing" stackId="emails" radius={0} fill="var(--color-processing)" />
                  <Bar yAxisId="count" dataKey="forwarded" stackId="emails" radius={0} fill="var(--color-forwarded)" />
                  <Bar yAxisId="count" dataKey="error" stackId="emails" radius={0} fill="var(--color-error)" />
                  <Bar yAxisId="count" dataKey="skipped" stackId="emails" radius={0} fill="var(--color-skipped)" />
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
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-6">
                {legendItems.map((item) => (
                  <div key={item.key} className="rounded-lg border border-gray-200 bg-white/60 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartConfig[item.key].color }} aria-hidden />
                      <span>{item.label}</span>
                    </div>
                    <p className="mt-0.5 font-semibold text-gray-900 dark:text-gray-100">
                      {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
