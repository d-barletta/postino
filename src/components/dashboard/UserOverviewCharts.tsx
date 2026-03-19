import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/Chart';
import type { UserStats } from '@/types';

interface UserOverviewChartsProps {
  stats: UserStats;
}

const chartConfig = {
  received: { label: 'Received', color: '#3b82f6' },
  forwarded: { label: 'Forwarded', color: '#16a34a' },
  error: { label: 'Error', color: '#dc2626' },
} satisfies ChartConfig;

export function UserOverviewCharts({ stats }: UserOverviewChartsProps) {
  const volumeData = [
    { name: 'Received', value: stats.totalEmailsReceived, fill: 'var(--color-received)' },
    { name: 'Forwarded', value: stats.totalEmailsForwarded, fill: 'var(--color-forwarded)' },
    { name: 'Error', value: stats.totalEmailsError, fill: 'var(--color-error)' },
  ];

  const legendItems = [
    { key: 'received', label: 'Received', value: stats.totalEmailsReceived },
    { key: 'forwarded', label: 'Forwarded', value: stats.totalEmailsForwarded },
    { key: 'error', label: 'Error', value: stats.totalEmailsError },
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
              <ChartContainer config={chartConfig}>
                <BarChart data={volumeData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="value" radius={0}>
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
