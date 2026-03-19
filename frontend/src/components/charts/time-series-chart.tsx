'use client';

import { useMemo } from 'react';
import { EChartsWrapper } from './echarts-wrapper';
import type { EChartsOption } from 'echarts';

const CHART_COLORS = [
  '#58A6FF', '#3FB950', '#D29922', '#F85149',
  '#BC8CFF', '#F778BA', '#79C0FF', '#56D364',
];

interface SeriesData {
  name: string;
  data: [number, number][]; // [timestamp, value]
  color?: string;
  type?: 'line' | 'bar' | 'area';
  dashStyle?: boolean;
}

interface TimeSeriesChartProps {
  series: SeriesData[];
  height?: number;
  yAxisLabel?: string;
  thresholdLine?: { value: number; label: string; color?: string };
  className?: string;
}

export function TimeSeriesChart({
  series,
  height = 240,
  yAxisLabel,
  thresholdLine,
  className,
}: TimeSeriesChartProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option = useMemo<any>(() => {
    const echartsSeriesData = series.map((s, i) => {
      const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
      const isArea = s.type === 'area';

      return {
        name: s.name,
        type: (s.type === 'bar' ? 'bar' : 'line') as 'line' | 'bar',
        data: s.data,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 1.5,
          color,
          type: s.dashStyle ? ('dashed' as const) : ('solid' as const),
        },
        itemStyle: { color },
        areaStyle: isArea ? { color, opacity: 0.08 } : undefined,
        markLine: thresholdLine
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: thresholdLine.color ?? '#F85149',
                type: 'dashed' as const,
                width: 1,
              },
              data: [
                {
                  yAxis: thresholdLine.value,
                  label: {
                    formatter: thresholdLine.label,
                    color: thresholdLine.color ?? '#F85149',
                    fontSize: 10,
                  },
                },
              ],
            }
          : undefined,
      };
    });

    return {
      animation: false,
      xAxis: {
        type: 'time',
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
      },
      series: echartsSeriesData,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: '#484F58' } },
      },
      legend: {
        show: series.length > 1,
        bottom: 0,
        itemWidth: 14,
        itemHeight: 3,
        textStyle: { fontSize: 11 },
      },
      grid: {
        left: 52,
        right: 16,
        top: yAxisLabel ? 32 : 16,
        bottom: series.length > 1 ? 36 : 16,
      },
    };
  }, [series, yAxisLabel, thresholdLine]);

  return <EChartsWrapper option={option} height={height} className={className} />;
}
