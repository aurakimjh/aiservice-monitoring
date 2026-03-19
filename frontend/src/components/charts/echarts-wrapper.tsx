'use client';

import { useRef, useEffect, useCallback } from 'react';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, ScatterChart, HeatmapChart, GaugeChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  TitleComponent,
  ToolboxComponent,
} from 'echarts/components';
import type { EChartsOption } from 'echarts';

type EChartsInstance = ReturnType<typeof echarts.init>;

echarts.use([
  CanvasRenderer,
  LineChart, BarChart, ScatterChart, HeatmapChart, GaugeChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent, TitleComponent, ToolboxComponent,
]);

// Dark theme for all charts
const DARK_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: '#8B949E', fontSize: 11 },
  legend: { textStyle: { color: '#8B949E' } },
  tooltip: {
    backgroundColor: '#30363D',
    borderColor: '#484F58',
    textStyle: { color: '#E6EDF3', fontSize: 12 },
  },
  grid: {
    left: 48,
    right: 16,
    top: 24,
    bottom: 32,
    containLabel: false,
  },
  xAxis: {
    axisLine: { lineStyle: { color: '#21262D' } },
    axisTick: { lineStyle: { color: '#21262D' } },
    axisLabel: { color: '#8B949E', fontSize: 11 },
    splitLine: { lineStyle: { color: '#21262D', type: 'dashed' as const } },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8B949E', fontSize: 11 },
    splitLine: { lineStyle: { color: '#21262D', type: 'dashed' as const } },
  },
};

interface EChartsWrapperProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onInit?: (chart: EChartsInstance) => void;
}

export function EChartsWrapper({ option, height = 300, className, onInit }: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    if (chartRef.current) chartRef.current.dispose();

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const mergedOption = echarts.util.merge(
      echarts.util.clone(DARK_THEME),
      option,
      true,
    ) as EChartsOption;
    chart.setOption(mergedOption);
    onInit?.(chart);
  }, [option, onInit]);

  useEffect(() => {
    initChart();
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [initChart]);

  useEffect(() => {
    const handleResize = () => chartRef.current?.resize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
    />
  );
}
