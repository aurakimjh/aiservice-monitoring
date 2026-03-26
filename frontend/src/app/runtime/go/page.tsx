'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, SearchInput, Select } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import type { GoSchedulerMetrics, GoSchedHistogramBucket } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';
import {
  Cpu,
  Activity,
  Layers,
  MemoryStick,
  Filter,
  Server,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_AGENTS: GoSchedulerMetrics[] = [
  {
    agent_id: 'go-agent-001',
    hostname: 'ingestion-01',
    go_version: '1.24.1',
    sched_latency_p50_us: 8,
    sched_latency_p95_us: 72,
    sched_latency_p99_us: 310,
    gc_stw_pause_us: 45,
    gc_stw_frequency: 1.2,
    goroutines_total: 1842,
    goroutines_runnable: 24,
    goroutines_waiting: 1790,
    gomaxprocs: 8,
    cgo_calls: 12400,
    heap_alloc_mb: 256,
    heap_sys_mb: 512,
    stack_inuse_mb: 18,
    collected_at: '2026-03-26T09:15:00Z',
  },
  {
    agent_id: 'go-agent-002',
    hostname: 'collector-02',
    go_version: '1.24.2',
    sched_latency_p50_us: 12,
    sched_latency_p95_us: 95,
    sched_latency_p99_us: 480,
    gc_stw_pause_us: 68,
    gc_stw_frequency: 2.1,
    goroutines_total: 3210,
    goroutines_runnable: 48,
    goroutines_waiting: 3105,
    gomaxprocs: 16,
    cgo_calls: 890,
    heap_alloc_mb: 512,
    heap_sys_mb: 1024,
    stack_inuse_mb: 32,
    collected_at: '2026-03-26T09:14:30Z',
  },
  {
    agent_id: 'go-agent-003',
    hostname: 'gateway-01',
    go_version: '1.24.1',
    sched_latency_p50_us: 5,
    sched_latency_p95_us: 48,
    sched_latency_p99_us: 180,
    gc_stw_pause_us: 32,
    gc_stw_frequency: 0.8,
    goroutines_total: 920,
    goroutines_runnable: 12,
    goroutines_waiting: 880,
    gomaxprocs: 4,
    cgo_calls: 200,
    heap_alloc_mb: 128,
    heap_sys_mb: 256,
    stack_inuse_mb: 8,
    collected_at: '2026-03-26T09:15:10Z',
  },
  {
    agent_id: 'go-agent-004',
    hostname: 'processor-03',
    go_version: '1.24.2',
    sched_latency_p50_us: 18,
    sched_latency_p95_us: 185,
    sched_latency_p99_us: 1120,
    gc_stw_pause_us: 142,
    gc_stw_frequency: 3.5,
    goroutines_total: 14200,
    goroutines_runnable: 310,
    goroutines_waiting: 13650,
    gomaxprocs: 16,
    cgo_calls: 45000,
    heap_alloc_mb: 1024,
    heap_sys_mb: 2048,
    stack_inuse_mb: 96,
    collected_at: '2026-03-26T09:14:55Z',
  },
  {
    agent_id: 'go-agent-005',
    hostname: 'exporter-01',
    go_version: '1.22.8',
    sched_latency_p50_us: 15,
    sched_latency_p95_us: 130,
    sched_latency_p99_us: 720,
    gc_stw_pause_us: 95,
    gc_stw_frequency: 2.8,
    goroutines_total: 5400,
    goroutines_runnable: 85,
    goroutines_waiting: 5200,
    gomaxprocs: 8,
    cgo_calls: 8200,
    heap_alloc_mb: 384,
    heap_sys_mb: 768,
    stack_inuse_mb: 42,
    collected_at: '2026-03-26T09:15:05Z',
  },
  {
    agent_id: 'go-agent-006',
    hostname: 'scheduler-02',
    go_version: '1.24.1',
    sched_latency_p50_us: 7,
    sched_latency_p95_us: 58,
    sched_latency_p99_us: 240,
    gc_stw_pause_us: 38,
    gc_stw_frequency: 1.0,
    goroutines_total: 1560,
    goroutines_runnable: 18,
    goroutines_waiting: 1510,
    gomaxprocs: 8,
    cgo_calls: 3100,
    heap_alloc_mb: 196,
    heap_sys_mb: 384,
    stack_inuse_mb: 14,
    collected_at: '2026-03-26T09:14:45Z',
  },
];

const DEMO_HISTOGRAM: GoSchedHistogramBucket[] = [
  { le_us: 1, count: 48200 },
  { le_us: 10, count: 125600 },
  { le_us: 100, count: 89400 },
  { le_us: 500, count: 32100 },
  { le_us: 1000, count: 12800 },
  { le_us: 5000, count: 4500 },
  { le_us: 10000, count: 1200 },
  { le_us: 50000, count: 340 },
  { le_us: 100000, count: 85 },
];

const GC_STW_TIMELINE = [
  { time: '09:04', value: 42 },
  { time: '09:05', value: 55 },
  { time: '09:06', value: 38 },
  { time: '09:07', value: 67 },
  { time: '09:08', value: 48 },
  { time: '09:09', value: 145 },
  { time: '09:10', value: 52 },
  { time: '09:11', value: 41 },
  { time: '09:12', value: 88 },
  { time: '09:13', value: 36 },
  { time: '09:14', value: 62 },
  { time: '09:15', value: 45 },
];

const GO_VERSION_OPTIONS = [
  { label: 'All Versions', value: '' },
  { label: 'Go 1.24.x', value: '1.24' },
  { label: 'Go 1.22.x', value: '1.22' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBucketLabel(leUs: number): string {
  if (leUs < 1000) return `${leUs}\u00b5s`;
  if (leUs < 1000000) return `${leUs / 1000}ms`;
  return `${leUs / 1000000}s`;
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function GoRuntimePage() {
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState('');

  const agents = useMemo(() => DEMO_AGENTS, []);

  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (versionFilter && !a.go_version.startsWith(versionFilter)) return false;
      if (search) {
        const term = search.toLowerCase();
        if (
          !a.hostname.toLowerCase().includes(term) &&
          !a.agent_id.toLowerCase().includes(term)
        ) return false;
      }
      return true;
    });
  }, [agents, versionFilter, search]);

  // ── KPI aggregates ──
  const kpi = useMemo(() => {
    const p95Vals = agents.map(a => a.sched_latency_p95_us);
    const maxP95 = Math.max(...p95Vals);
    const avgSTW = Math.round(agents.reduce((s, a) => s + a.gc_stw_pause_us, 0) / agents.length);
    const totalGoroutines = agents.reduce((s, a) => s + a.goroutines_total, 0);
    const totalHeap = agents.reduce((s, a) => s + a.heap_alloc_mb, 0);
    return { maxP95, avgSTW, totalGoroutines, totalHeap };
  }, [agents]);

  // ── Scheduler Latency Histogram chart ──
  const histogramOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const data = (p as { name: string; value: number });
        return `<div style="font-size:12px"><b>${data.name}</b><br/>Events: <b>${data.value.toLocaleString()}</b></div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: DEMO_HISTOGRAM.map(b => formatBucketLabel(b.le_us)),
      axisLabel: { rotate: 30, fontSize: 10, color: '#8B949E' },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
        color: '#8B949E',
      },
    },
    series: [{
      type: 'bar',
      data: DEMO_HISTOGRAM.map(b => b.count),
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#00ADD8' },
            { offset: 1, color: 'rgba(0,173,216,0.3)' },
          ],
        },
        borderRadius: [3, 3, 0, 0],
      },
      barMaxWidth: 48,
    }],
    grid: { left: 56, right: 16, top: 16, bottom: 48 },
  }), []);

  // ── GC STW Pause line chart ──
  const gcSTWOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const data = (p as { name: string; value: number });
        return `<div style="font-size:12px"><b>${data.name}</b><br/>STW Pause: <b>${data.value}\u00b5s</b></div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: GC_STW_TIMELINE.map(d => d.time),
      axisLabel: { fontSize: 10, color: '#8B949E' },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => `${v}\u00b5s`,
        color: '#8B949E',
      },
    },
    series: [{
      type: 'line',
      data: GC_STW_TIMELINE.map(d => d.value),
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#F85149', width: 2 },
      itemStyle: { color: '#F85149' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(248,81,73,0.25)' },
            { offset: 1, color: 'rgba(248,81,73,0.02)' },
          ],
        },
      },
      markLine: {
        silent: true,
        data: [{ yAxis: 100, label: { formatter: '100\u00b5s threshold', fontSize: 10, color: '#D29922' }, lineStyle: { color: '#D29922', type: 'dashed' } }],
      },
    }],
    grid: { left: 56, right: 16, top: 16, bottom: 32 },
  }), []);

  // ── Goroutine Breakdown stacked bar chart ──
  const goroutineOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      data: ['Runnable', 'Waiting'],
      textStyle: { color: '#8B949E', fontSize: 11 },
      top: 0,
      right: 0,
    },
    xAxis: {
      type: 'category',
      data: agents.map(a => a.hostname),
      axisLabel: { fontSize: 10, color: '#8B949E', rotate: 20 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
        color: '#8B949E',
      },
    },
    series: [
      {
        name: 'Runnable',
        type: 'bar',
        stack: 'goroutines',
        data: agents.map(a => a.goroutines_runnable),
        itemStyle: { color: '#3FB950', borderRadius: [0, 0, 0, 0] },
        barMaxWidth: 40,
      },
      {
        name: 'Waiting',
        type: 'bar',
        stack: 'goroutines',
        data: agents.map(a => a.goroutines_waiting),
        itemStyle: { color: '#58A6FF', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 40,
      },
    ],
    grid: { left: 56, right: 16, top: 32, bottom: 48 },
  }), [agents]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Runtime', href: '/runtime' },
          { label: 'Go', icon: <Cpu size={14} /> },
        ]}
      />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Go Runtime Monitor</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Go 1.24 scheduler latency histograms, GC STW pause tracking, goroutine analysis and heap profiling
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Sched Latency P95"
          value={kpi.maxP95}
          unit={'\u00b5s'}
          subtitle="worst-case across agents"
          status={kpi.maxP95 > 150 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="GC STW Pause"
          value={kpi.avgSTW}
          unit={'\u00b5s'}
          subtitle="average STW duration"
          status={kpi.avgSTW > 100 ? 'critical' : kpi.avgSTW > 60 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Total Goroutines"
          value={kpi.totalGoroutines.toLocaleString()}
          subtitle="across all agents"
          status={kpi.totalGoroutines > 20000 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Heap Alloc"
          value={Math.round(kpi.totalHeap / 1024 * 100) / 100 >= 1 ? `${(kpi.totalHeap / 1024).toFixed(1)}` : String(kpi.totalHeap)}
          unit={kpi.totalHeap >= 1024 ? 'GB' : 'MB'}
          subtitle="total heap allocation"
          status="healthy"
        />
      </div>

      {/* Agent Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-[var(--text-muted)]" />
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search host..."
            className="w-44"
          />
        </div>
        <div className="flex items-center gap-1">
          <Server size={12} className="text-[var(--text-muted)]" />
          <Select
            options={GO_VERSION_OPTIONS}
            value={versionFilter}
            onChange={e => setVersionFilter(e.target.value)}
            aria-label="Filter by Go version"
          />
        </div>
        <span className="text-xs text-[var(--text-muted)] ml-auto">{filtered.length} agent{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Agent Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Agent Overview</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-left text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Hostname</th>
                <th className="px-3 py-2 font-medium">Go Version</th>
                <th className="px-3 py-2 font-medium text-right">Sched P50</th>
                <th className="px-3 py-2 font-medium text-right">Sched P95</th>
                <th className="px-3 py-2 font-medium text-right">Sched P99</th>
                <th className="px-3 py-2 font-medium text-right">GC STW</th>
                <th className="px-3 py-2 font-medium text-right">Goroutines</th>
                <th className="px-3 py-2 font-medium text-right">GOMAXPROCS</th>
                <th className="px-3 py-2 font-medium text-right">Heap</th>
                <th className="px-3 py-2 font-medium text-right">Stack</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const highLatency = a.sched_latency_p99_us > 1000;
                const highGoroutines = a.goroutines_total > 10000;

                return (
                  <tr
                    key={a.agent_id}
                    className="border-b border-[var(--border-default)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div className="text-[var(--text-primary)] font-medium">{a.hostname}</div>
                      <div className="text-[var(--text-muted)] text-[10px]">{a.agent_id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: a.go_version.startsWith('1.24') ? 'rgba(0,173,216,0.15)' : 'rgba(139,148,158,0.15)',
                          color: a.go_version.startsWith('1.24') ? '#00ADD8' : '#8B949E',
                        }}
                      >
                        Go {a.go_version}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.sched_latency_p50_us}{'\u00b5s'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.sched_latency_p95_us}{'\u00b5s'}
                    </td>
                    <td
                      className="px-3 py-2 text-right font-mono font-medium"
                      style={{ color: highLatency ? '#F85149' : 'var(--text-primary)' }}
                    >
                      {a.sched_latency_p99_us}{'\u00b5s'}
                      {highLatency && (
                        <span className="ml-1 text-[10px] text-[#F85149]" title="P99 > 1000\u00b5s">!!!</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.gc_stw_pause_us}{'\u00b5s'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-mono font-medium"
                        style={{ color: highGoroutines ? '#D29922' : 'var(--text-primary)' }}
                      >
                        {a.goroutines_total.toLocaleString()}
                      </span>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {a.goroutines_runnable}r / {a.goroutines_waiting.toLocaleString()}w
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.gomaxprocs}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.heap_alloc_mb >= 1024 ? `${(a.heap_alloc_mb / 1024).toFixed(1)}GB` : `${a.heap_alloc_mb}MB`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">
                      {a.stack_inuse_mb}MB
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    No agents found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scheduler Latency Histogram */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[#00ADD8]" />
              <CardTitle className="text-sm">Scheduler Latency Histogram</CardTitle>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              Distribution of goroutine scheduling delays across all agents
            </p>
          </CardHeader>
          <div className="px-3 pb-3">
            <EChartsWrapper option={histogramOption} height={280} />
          </div>
        </Card>

        {/* GC STW Pause */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-[#F85149]" />
              <CardTitle className="text-sm">GC Stop-the-World Pause</CardTitle>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              STW pause duration over time (aggregated across agents)
            </p>
          </CardHeader>
          <div className="px-3 pb-3">
            <EChartsWrapper option={gcSTWOption} height={280} />
          </div>
        </Card>
      </div>

      {/* Goroutine Breakdown */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MemoryStick size={14} className="text-[#3FB950]" />
            <CardTitle className="text-sm">Goroutine Breakdown by Agent</CardTitle>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            Runnable vs waiting goroutines per agent — high runnable count may indicate CPU contention
          </p>
        </CardHeader>
        <div className="px-3 pb-3">
          <EChartsWrapper option={goroutineOption} height={300} />
        </div>
      </Card>
    </div>
  );
}
