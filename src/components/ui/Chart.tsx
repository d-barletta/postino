'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label: string;
    color: string;
  }
>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }
  return context;
}

type ChartContainerProps = React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
};

function ChartContainer({ id, className, config, children, ...props }: ChartContainerProps) {
  const chartId = React.useId();
  const resolvedId = id ?? chartId;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={resolvedId}
        className={cn(
          'h-70 w-full',
          '[&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-gray-200',
          'dark:[&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-gray-700',
          '[&_.recharts-legend-item-text]:text-gray-600 dark:[&_.recharts-legend-item-text]:text-gray-300',
          className
        )}
        style={
          Object.entries(config).reduce((acc, [key, value]) => {
            acc[`--color-${key}`] = value.color;
            return acc;
          }, {} as Record<string, string>)
        }
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

type ChartTooltipPayloadProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatter?: (
    value: unknown,
    name: unknown,
    item: TooltipEntry,
    payload: TooltipEntry[]
  ) => React.ReactNode;
  hideLabel?: boolean;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  formatter,
}: ChartTooltipPayloadProps) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-900/95">
      {!hideLabel && label != null ? (
        <div className="mb-1.5 font-medium text-gray-900 dark:text-gray-100">{String(label)}</div>
      ) : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? 'value');
          const itemConfig = config[key];
          const displayLabel = itemConfig?.label ?? String(item.name ?? key);
          const color = item.color ?? itemConfig?.color ?? '#8884d8';
          const value = formatter
            ? formatter(item.value, item.name, item, payload)
            : Number(item.value ?? 0).toLocaleString();

          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
                <span>{displayLabel}</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{value as React.ReactNode}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };