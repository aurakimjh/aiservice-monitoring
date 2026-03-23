'use client';

import { useRef, useEffect, useCallback, memo } from 'react';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, ScatterChart, HeatmapChart, GaugeChart, PieChart, RadarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  TitleComponent,
  ToolboxComponent,
  VisualMapComponent,
  BrushComponent,
  RadarComponent,
} from 'echarts/components';
import type { EChartsOption } from 'echarts';

type EChartsInstance = ReturnType<typeof echarts.init>;

// Register once at module level
echarts.use([
  CanvasRenderer,
  LineChart, BarChart, ScatterChart, HeatmapChart, GaugeChart, PieChart, RadarChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent, TitleComponent, ToolboxComponent,
  VisualMapComponent, BrushComponent, RadarComponent,
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

export const EChartsWrapper = memo(function EChartsWrapper({ option, height = 300, className, onInit }: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;

  // Init chart once, reuse on option change
  useEffect(() => {
    if (!containerRef.current) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
      onInitRef.current?.(chartRef.current);
    }

    const mergedOption = echarts.util.merge(
      echarts.util.clone(DARK_THEME),
      option,
      true,
    ) as EChartsOption;
    chartRef.current.setOption(mergedOption, { notMerge: true });

    return () => {};
  }, [option]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // Resize observer
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
      role="img"
      aria-label="Chart"
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
    />
  );
});
