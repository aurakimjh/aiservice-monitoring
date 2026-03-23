'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { EChartsWrapper } from '@/components/charts';
import type { ABTestComparison, EvalJobStatus } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';

interface ABComparisonProps {
  test: ABTestComparison;
}

const statusBadge: Record<EvalJobStatus, { status: 'healthy' | 'warning' | 'critical' | 'offline'; label: string }> = {
  completed: { status: 'healthy', label: 'Completed' },
  running: { status: 'warning', label: 'Running' },
  pending: { status: 'offline', label: 'Pending' },
  failed: { status: 'critical', label: 'Failed' },
};

export function ABComparison({ test }: ABComparisonProps) {
  const badge = statusBadge[test.status];

  const radarOption = useMemo<EChartsOption>(() => {
    const indicators = test.metricsA.map((m) => ({
      name: m.metric.charAt(0).toUpperCase() + m.metric.slice(1),
      max: 1,
    }));

    return {
      radar: {
        indicator: indicators,
        shape: 'polygon' as const,
        axisName: {
          color: '#8B949E',
          fontSize: 11,
        },
        splitArea: {
          areaStyle: {
            color: ['transparent'],
          },
        },
        splitLine: {
          lineStyle: {
            color: '#21262D',
          },
        },
        axisLine: {
          lineStyle: {
            color: '#21262D',
          },
        },
      },
      legend: {
        data: [test.modelA, test.modelB],
        bottom: 0,
        textStyle: { color: '#8B949E', fontSize: 11 },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: test.metricsA.map((m) => m.score),
              name: test.modelA,
              areaStyle: { opacity: 0.15 },
              lineStyle: { color: '#58A6FF', width: 2 },
              itemStyle: { color: '#58A6FF' },
            },
            {
              value: test.metricsB.map((m) => m.score),
              name: test.modelB,
              areaStyle: { opacity: 0.15 },
              lineStyle: { color: '#3FB950', width: 2 },
              itemStyle: { color: '#3FB950' },
            },
          ],
        },
      ],
    };
  }, [test]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>{test.name}</CardTitle>
          <Badge variant="status" status={badge.status}>{badge.label}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>{test.datasetName}</span>
          <span>&middot;</span>
          <span>{test.sampleCount} samples</span>
        </div>
      </CardHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: metric comparison + win rate */}
        <div className="space-y-4">
          {/* Model headers */}
          <div className="grid grid-cols-3 gap-2 text-xs font-medium">
            <div className="text-[var(--text-secondary)]">Metric</div>
            <div className="text-center text-[#58A6FF]">{test.modelA}</div>
            <div className="text-center text-[#3FB950]">{test.modelB}</div>
          </div>

          {/* Per-metric rows */}
          {test.metricsA.map((metricA, idx) => {
            const metricB = test.metricsB[idx];
            const aWins = metricA.score > metricB.score;
            const bWins = metricB.score > metricA.score;

            return (
              <div key={metricA.metric} className="grid grid-cols-3 gap-2 text-xs items-center">
                <div className="text-[var(--text-secondary)] capitalize">
                  {metricA.metric}
                </div>
                <div className={cn(
                  'text-center tabular-nums font-medium',
                  aWins ? 'text-[#58A6FF]' : 'text-[var(--text-secondary)]',
                )}>
                  {metricA.score.toFixed(2)}
                  {aWins && <span className="ml-1 text-[10px]">&uarr;</span>}
                </div>
                <div className={cn(
                  'text-center tabular-nums font-medium',
                  bWins ? 'text-[#3FB950]' : 'text-[var(--text-secondary)]',
                )}>
                  {metricB.score.toFixed(2)}
                  {bWins && <span className="ml-1 text-[10px]">&uarr;</span>}
                </div>
              </div>
            );
          })}

          {/* Win rate bars */}
          <div className="pt-2 border-t border-[var(--border-default)]">
            <div className="text-xs text-[var(--text-secondary)] mb-2 font-medium">Win Rate</div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums font-medium text-[#58A6FF] min-w-[32px] text-right">
                {test.winRateA}%
              </span>
              <div className="flex-1 h-3 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-[#58A6FF] transition-all"
                  style={{ width: `${test.winRateA}%` }}
                />
                <div
                  className="h-full bg-[#3FB950] transition-all"
                  style={{ width: `${test.winRateB}%` }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium text-[#3FB950] min-w-[32px]">
                {test.winRateB}%
              </span>
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-[var(--text-muted)]">
              <span>{test.modelA}</span>
              <span>{test.modelB}</span>
            </div>
          </div>
        </div>

        {/* Right: radar chart */}
        <div>
          <EChartsWrapper option={radarOption} height={260} />
        </div>
      </div>
    </Card>
  );
}
