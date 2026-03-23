'use client';

import { useMemo } from 'react';
import { EChartsWrapper } from '@/components/charts';
import type { DynamicThreshold } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';

interface AnomalyChartProps {
  threshold: DynamicThreshold;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AnomalyChart({ threshold }: AnomalyChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const xData = threshold.timestamps.map(formatTime);

    // Build markArea data from anomaly ranges
    const markAreaData = threshold.anomalyRanges.map((range) => {
      const startIdx = threshold.timestamps.findIndex((t) => t >= range.start);
      const endIdx = threshold.timestamps.findIndex((t) => t >= range.end);
      return [
        {
          xAxis: xData[startIdx >= 0 ? startIdx : 0],
          itemStyle: { color: 'rgba(248, 81, 73, 0.12)' },
        },
        {
          xAxis: xData[endIdx >= 0 ? endIdx : xData.length - 1],
        },
      ];
    });

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const time = params[0].axisValue;
          let html = `<div style="font-weight:600;margin-bottom:4px">${time}</div>`;
          for (const p of params) {
            if (p.seriesName === 'Upper Band' || p.seriesName === 'Lower Band Fill') continue;
            const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px"></span>`;
            html += `<div>${dot}${p.seriesName}: <strong>${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong></div>`;
          }
          // Show upper/lower bounds from the band series
          const upperSeries = params.find((p: any) => p.seriesName === 'Upper Band');
          const lowerSeries = params.find((p: any) => p.seriesName === 'Lower Band Fill');
          if (upperSeries) {
            html += `<div style="color:#8B949E">Upper: ${typeof upperSeries.value === 'number' ? upperSeries.value.toFixed(2) : upperSeries.value}</div>`;
          }
          if (lowerSeries) {
            html += `<div style="color:#8B949E">Lower: ${typeof lowerSeries.value === 'number' ? lowerSeries.value.toFixed(2) : lowerSeries.value}</div>`;
          }
          return html;
        },
      },
      legend: {
        data: ['Actual', 'Baseline', 'Upper Band'],
        top: 0,
        right: 0,
        textStyle: { color: '#8B949E', fontSize: 10 },
        itemWidth: 14,
        itemHeight: 8,
      },
      grid: {
        left: 48,
        right: 16,
        top: 32,
        bottom: 28,
      },
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: {
          color: '#8B949E',
          fontSize: 10,
          interval: Math.floor(xData.length / 8),
        },
        axisLine: { lineStyle: { color: '#21262D' } },
        axisTick: { lineStyle: { color: '#21262D' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#8B949E', fontSize: 10 },
        splitLine: { lineStyle: { color: '#21262D', type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        // Lower band (invisible base for area fill)
        {
          name: 'Lower Band Fill',
          type: 'line',
          data: threshold.lowerBand,
          symbol: 'none',
          lineStyle: {
            width: 1,
            type: 'dashed',
            color: '#484F58',
          },
          z: 1,
        },
        // Upper band — fills down to lower band via areaStyle + stack
        {
          name: 'Upper Band',
          type: 'line',
          data: threshold.upperBand.map((u, i) => u - threshold.lowerBand[i]),
          symbol: 'none',
          stack: 'band',
          lineStyle: {
            width: 1,
            type: 'dashed',
            color: '#484F58',
          },
          areaStyle: {
            color: 'rgba(139, 148, 158, 0.08)',
          },
          z: 1,
        },
        // Stack base for upper band area fill
        {
          name: '_bandBase',
          type: 'line',
          data: threshold.lowerBand,
          symbol: 'none',
          stack: 'band',
          lineStyle: { width: 0, opacity: 0 },
          z: 0,
        },
        // Baseline (green dashed)
        {
          name: 'Baseline',
          type: 'line',
          data: threshold.baseline,
          symbol: 'none',
          lineStyle: {
            width: 1.5,
            type: 'dashed',
            color: '#3FB950',
          },
          z: 2,
        },
        // Actual values (blue solid)
        {
          name: 'Actual',
          type: 'line',
          data: threshold.values,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: '#58A6FF',
          },
          itemStyle: { color: '#58A6FF' },
          markArea: {
            silent: true,
            data: markAreaData as any,
          },
          z: 3,
        },
      ],
    };
  }, [threshold]);

  return <EChartsWrapper option={option} height={260} />;
}
