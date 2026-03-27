'use client';

/**
 * APM Service Dashboard Widgets (Phase 47)
 *
 * 8 specialized APM widgets for real-time service monitoring:
 *   1. TPS (Transactions Per Second)
 *   2. Today TPS (daily comparison)
 *   3. Today Users (daily comparison)
 *   4. Avg Response Time (with thresholds)
 *   5. Active Transactions (with color escalation)
 *   6. Active Status (METHOD/SQL/HTTPC/DBC/SOCKET breakdown)
 *   7. Transaction Speed (RPS → Processing → TPS flow)
 *   8. Concurrent Users (real-time count)
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { EChartsWrapper } from '@/components/charts';
import type { WidgetConfig, WidgetViewMode } from '@/types/monitoring';

// ── Seeded random for deterministic demo data ──

function seeded(seed: number) {
  return () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };
}

function demoTimeSeries(base: number, variance: number, points: number, seed = 42): [number, number][] {
  const rng = seeded(seed);
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => [
    now - (points - i) * 5000,
    Math.max(0, base + (rng() - 0.5) * variance * 2),
  ] as [number, number]);
}

function demoDayTimeSeries(base: number, variance: number, seed = 100): [number, number][] {
  const rng = seeded(seed);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const points = Math.min(Math.floor((Date.now() - today.getTime()) / 60000), 1440);
  return Array.from({ length: points }, (_, i) => [
    today.getTime() + i * 60000,
    Math.max(0, base + Math.sin(i / 60) * variance * 0.5 + (rng() - 0.5) * variance),
  ] as [number, number]);
}

// ── Shared helpers ──

const AREA_STYLE = { opacity: 0.15 };
const GRID = { left: 44, right: 12, top: 8, bottom: 20 };
const X_TIME = { type: 'time' as const, axisLabel: { fontSize: 9, color: '#8B949E' }, splitLine: { show: false } };
const Y_VALUE = (name: string) => ({
  type: 'value' as const, name, nameTextStyle: { fontSize: 9, color: '#8B949E' },
  axisLabel: { fontSize: 9, color: '#8B949E' }, splitLine: { lineStyle: { color: '#21262D' } },
});

interface ApmWidgetProps {
  widget: WidgetConfig;
  height: number;
}

// ══════════════════════════════════════════════════════════════
// 1. TPS Widget — Real-time TPS (5s interval, area chart)
// ══════════════════════════════════════════════════════════════

export function TpsWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(1200, 300, 120, 1), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('TPS'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#58A6FF', width: 1.5 },
      areaStyle: { color: '#58A6FF', ...AREA_STYLE },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{Math.round(lastVal).toLocaleString()}</span>
        <span className="text-[10px] text-[var(--text-muted)]">TPS</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 2. Today TPS Widget — Daily TPS comparison
// ══════════════════════════════════════════════════════════════

export function TpsDailyWidget({ widget, height }: ApmWidgetProps) {
  const todayData = useMemo(() => demoDayTimeSeries(1100, 400, 200), []);
  const yesterdayData = useMemo(() => demoDayTimeSeries(980, 350, 300), []);

  const lastToday = todayData[todayData.length - 1]?.[1] ?? 0;
  const lastYesterday = yesterdayData[Math.min(todayData.length - 1, yesterdayData.length - 1)]?.[1] ?? 0;
  const diff = lastYesterday > 0 ? ((lastToday - lastYesterday) / lastYesterday * 100) : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('TPS'),
    tooltip: { trigger: 'axis' },
    legend: { show: true, bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 9, color: '#8B949E' } },
    series: [
      { name: 'Yesterday', type: 'line', data: yesterdayData, smooth: true, symbol: 'none', lineStyle: { color: '#484F58', width: 1 }, areaStyle: { color: '#484F58', opacity: 0.08 } },
      { name: 'Today', type: 'line', data: todayData, smooth: true, symbol: 'none', lineStyle: { color: '#58A6FF', width: 1.5 }, areaStyle: { color: '#58A6FF', ...AREA_STYLE } },
    ],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{Math.round(lastToday).toLocaleString()}</span>
        <span className={cn('text-[10px] font-medium', diff >= 0 ? 'text-[#3FB950]' : 'text-[#F85149]')}>
          {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
        </span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 30} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 3. Today Users Widget — Daily user count comparison
// ══════════════════════════════════════════════════════════════

export function UsersDailyWidget({ widget, height }: ApmWidgetProps) {
  const todayData = useMemo(() => demoDayTimeSeries(320, 80, 400), []);
  const yesterdayData = useMemo(() => demoDayTimeSeries(290, 70, 500), []);

  const lastVal = todayData[todayData.length - 1]?.[1] ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('Users'),
    tooltip: { trigger: 'axis' },
    legend: { show: true, bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 9, color: '#8B949E' } },
    series: [
      { name: 'Yesterday', type: 'line', data: yesterdayData, smooth: true, symbol: 'none', lineStyle: { color: '#484F58', width: 1 }, areaStyle: { color: '#484F58', opacity: 0.08 } },
      { name: 'Today', type: 'line', data: todayData, smooth: true, symbol: 'none', lineStyle: { color: '#3FB950', width: 1.5 }, areaStyle: { color: '#3FB950', ...AREA_STYLE } },
    ],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{Math.round(lastVal)}</span>
        <span className="text-[10px] text-[var(--text-muted)]">users</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 30} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 4. Avg Response Time Widget — with threshold lines
// ══════════════════════════════════════════════════════════════

export function ResponseTimeWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(245, 80, 120, 2), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('ms'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#58A6FF', width: 1.5 },
      areaStyle: { color: '#58A6FF', ...AREA_STYLE },
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 500, lineStyle: { color: '#D29922', type: 'dashed', width: 1 }, label: { formatter: 'Warning: 500ms', fontSize: 8, color: '#D29922' } },
          { yAxis: 1000, lineStyle: { color: '#F85149', type: 'dashed', width: 1 }, label: { formatter: 'Critical: 1s', fontSize: 8, color: '#F85149' } },
        ],
      },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn('text-xl font-bold tabular-nums',
          lastVal > 1000 ? 'text-[#F85149]' : lastVal > 500 ? 'text-[#D29922]' : 'text-[var(--text-primary)]')}>
          {Math.round(lastVal)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">ms avg</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 5. Active Transactions Widget — count + color escalation
// ══════════════════════════════════════════════════════════════

export function ActiveTxnWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(85, 40, 120, 3), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;
  const color = lastVal > 200 ? '#F85149' : lastVal > 100 ? '#D29922' : '#58A6FF';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('count'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: { color, ...AREA_STYLE },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-xl font-bold tabular-nums" style={{ color }}>{Math.round(lastVal)}</span>
        <span className="text-[10px] text-[var(--text-muted)]">active</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 6. Active Status Widget — METHOD/SQL/HTTPC/DBC/SOCKET
// ══════════════════════════════════════════════════════════════

const STATUS_ITEMS = [
  { key: 'METHOD', color: '#58A6FF', base: 35 },
  { key: 'SQL', color: '#D29922', base: 25 },
  { key: 'HTTPC', color: '#BC8CFF', base: 15 },
  { key: 'DBC', color: '#F85149', base: 2, warn: true },
  { key: 'SOCKET', color: '#F85149', base: 1, warn: true },
];

export function ActiveStatusWidget({ widget, height }: ApmWidgetProps) {
  const rng = useMemo(() => seeded(4), []);
  const values = useMemo(() =>
    STATUS_ITEMS.map((s) => ({ ...s, value: Math.round(Math.max(0, s.base + (rng() - 0.5) * s.base)) })),
    [rng],
  );
  const total = values.reduce((s, v) => s + v.value, 0);
  const hasWarn = values.some((v) => v.warn && v.value >= 1);

  return (
    <div className="h-full flex flex-col gap-1.5 justify-center">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{total}</span>
        <span className="text-[10px] text-[var(--text-muted)]">active</span>
        {hasWarn && <span className="text-[9px] text-[#F85149] font-medium animate-pulse">Connection Pool Warning</span>}
      </div>
      <div className="space-y-1">
        {values.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-mono text-[var(--text-muted)]">{item.key}</span>
            <div className="flex-1 h-3 bg-[var(--bg-tertiary)] rounded-sm overflow-hidden">
              <div className="h-full rounded-sm transition-all" style={{
                width: `${total > 0 ? (item.value / total) * 100 : 0}%`,
                backgroundColor: item.color,
              }} />
            </div>
            <span className={cn('w-6 text-right text-[10px] font-bold tabular-nums',
              item.warn && item.value >= 1 ? 'text-[#F85149]' : 'text-[var(--text-secondary)]')}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 7. Transaction Speed Widget — RPS → Processing → TPS flow
// ══════════════════════════════════════════════════════════════

export function TxnSpeedWidget({ widget, height }: ApmWidgetProps) {
  const rng = useMemo(() => seeded(5), []);
  const rps = Math.round(1250 + (rng() - 0.5) * 400);
  const processing = Math.round(85 + (rng() - 0.5) * 60);
  const tps = Math.round(1220 + (rng() - 0.5) * 380);
  const backlog = rps > tps;

  return (
    <div className="h-full flex items-center justify-center gap-3">
      {/* RPS */}
      <div className="text-center">
        <div className="text-[10px] text-[var(--text-muted)] mb-1">RPS (in)</div>
        <div className="text-lg font-bold text-[#58A6FF] tabular-nums">{rps.toLocaleString()}</div>
      </div>

      {/* Arrow → */}
      <div className={cn('text-lg', backlog ? 'text-[#F85149]' : 'text-[var(--text-muted)]')}>→</div>

      {/* Processing (gauge) */}
      <div className="text-center">
        <div className="text-[10px] text-[var(--text-muted)] mb-1">Processing</div>
        <div className={cn('text-2xl font-bold tabular-nums',
          processing > 150 ? 'text-[#F85149]' : processing > 100 ? 'text-[#D29922]' : 'text-[var(--text-primary)]')}>
          {processing}
        </div>
        <div className="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full mt-1 mx-auto overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${Math.min(100, processing / 2)}%`,
            backgroundColor: processing > 150 ? '#F85149' : processing > 100 ? '#D29922' : '#3FB950',
          }} />
        </div>
      </div>

      {/* Arrow → */}
      <div className={cn('text-lg', backlog ? 'text-[#F85149]' : 'text-[var(--text-muted)]')}>→</div>

      {/* TPS */}
      <div className="text-center">
        <div className="text-[10px] text-[var(--text-muted)] mb-1">TPS (out)</div>
        <div className="text-lg font-bold text-[#3FB950] tabular-nums">{tps.toLocaleString()}</div>
      </div>

      {backlog && (
        <div className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-[#F85149] font-medium">
          Backlog detected (RPS &gt; TPS)
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 8. Concurrent Users Widget — real-time count + area chart
// ══════════════════════════════════════════════════════════════

export function ConcurrentUsersWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(340, 80, 360, 6), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('users'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#3FB950', width: 1.5 },
      areaStyle: { color: '#3FB950', ...AREA_STYLE },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{Math.round(lastVal)}</span>
        <span className="text-[10px] text-[var(--text-muted)]">concurrent users</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Registry — map WidgetType → Component
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// 9. AI Pipeline Waterfall — stage-by-stage latency
// ══════════════════════════════════════════════════════════════

const PIPELINE_STAGES = [
  { name: 'Guardrail (in)', color: '#9B59B6', baseMs: 12 },
  { name: 'Embedding', color: '#3498DB', baseMs: 45 },
  { name: 'Vector Search', color: '#2ECC71', baseMs: 85 },
  { name: 'LLM Inference', color: '#E67E22', baseMs: 820 },
  { name: 'Guardrail (out)', color: '#9B59B6', baseMs: 8 },
];

export function PipelineWaterfallWidget({ widget, height }: ApmWidgetProps) {
  const rng = useMemo(() => seeded(7), []);
  const stages = useMemo(() =>
    PIPELINE_STAGES.map((s) => ({
      ...s,
      ms: Math.round(s.baseMs + (rng() - 0.5) * s.baseMs * 0.3),
    })),
    [rng],
  );
  const totalMs = stages.reduce((s, st) => s + st.ms, 0);

  return (
    <div className="h-full flex flex-col gap-1.5 justify-center">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{totalMs}</span>
        <span className="text-[10px] text-[var(--text-muted)]">ms total</span>
      </div>
      {stages.map((stage) => {
        const pct = totalMs > 0 ? (stage.ms / totalMs) * 100 : 0;
        return (
          <div key={stage.name} className="flex items-center gap-2">
            <span className="w-24 text-[10px] text-[var(--text-muted)] truncate">{stage.name}</span>
            <div className="flex-1 h-4 bg-[var(--bg-tertiary)] rounded-sm overflow-hidden">
              <div className="h-full rounded-sm transition-all flex items-center px-1"
                style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: stage.color }}>
                <span className="text-[8px] text-white font-bold">{stage.ms}ms</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 10. AI TTFT Trend — Time To First Token over time
// ══════════════════════════════════════════════════════════════

export function TTFTTrendWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(1200, 300, 120, 8), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('ms'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#F778BA', width: 1.5 },
      areaStyle: { color: '#F778BA', ...AREA_STYLE },
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 2000, lineStyle: { color: '#F85149', type: 'dashed', width: 1 }, label: { formatter: 'SLO: 2s', fontSize: 8, color: '#F85149' } },
        ],
      },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn('text-xl font-bold tabular-nums',
          lastVal > 2000 ? 'text-[#F85149]' : lastVal > 1500 ? 'text-[#D29922]' : 'text-[var(--text-primary)]')}>
          {Math.round(lastVal)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">ms TTFT P95</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 11. AI Token Cost — hourly cost tracker
// ══════════════════════════════════════════════════════════════

export function TokenCostWidget({ widget, height }: ApmWidgetProps) {
  const data = useMemo(() => demoTimeSeries(12.5, 4, 120, 9), []);
  const lastVal = data[data.length - 1]?.[1] ?? 0;
  const dailyCost = lastVal * 24;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option: any = {
    animation: false, grid: GRID, xAxis: X_TIME, yAxis: Y_VALUE('$/h'),
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line', data, smooth: true, symbol: 'none',
      lineStyle: { color: '#D29922', width: 1.5 },
      areaStyle: { color: '#D29922', ...AREA_STYLE },
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: 15, lineStyle: { color: '#F85149', type: 'dashed', width: 1 }, label: { formatter: 'Budget: $15/h', fontSize: 8, color: '#F85149' } },
        ],
      },
    }],
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-2 mb-1">
        <span className={cn('text-xl font-bold tabular-nums',
          lastVal > 15 ? 'text-[#F85149]' : 'text-[var(--text-primary)]')}>
          ${lastVal.toFixed(1)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">/hour</span>
        <span className="text-[10px] text-[var(--text-muted)]">(~${dailyCost.toFixed(0)}/day)</span>
      </div>
      <div className="flex-1 min-h-0"><EChartsWrapper option={option} height={height - 32} /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════

export const APM_WIDGET_MAP: Record<string, React.ComponentType<ApmWidgetProps>> = {
  'apm-tps': TpsWidget,
  'apm-tps-daily': TpsDailyWidget,
  'apm-users-daily': UsersDailyWidget,
  'apm-response-time': ResponseTimeWidget,
  'apm-active-txn': ActiveTxnWidget,
  'apm-active-status': ActiveStatusWidget,
  'apm-txn-speed': TxnSpeedWidget,
  'apm-concurrent-users': ConcurrentUsersWidget,
  'ai-pipeline-waterfall': PipelineWaterfallWidget,
  'ai-ttft-trend': TTFTTrendWidget,
  'ai-token-cost': TokenCostWidget,
};
