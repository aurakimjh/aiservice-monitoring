'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, SearchInput, Select, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import type { EChartsOption } from 'echarts';
import type { DotNetAOTMetrics } from '@/types/monitoring';
import {
  Server,
  AlertTriangle,
  Cpu,
  MemoryStick,
  Shield,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

// ── Mode Filter Options ──────────────────────────────────────────────────────
const MODE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Native AOT', value: 'aot' },
  { label: 'JIT', value: 'jit' },
];

// ── Demo Data ────────────────────────────────────────────────────────────────
function generateDemoAgents(): DotNetAOTMetrics[] {
  return [
    {
      agent_id: 'dn-agent-001',
      hostname: 'web-prod-01',
      dotnet_version: '.NET 9.0-aot',
      is_native_aot: true,
      threadpool_threads: 12,
      threadpool_queue_length: 3,
      threadpool_completed: 184520,
      threadpool_starvation_count: 2,
      gc_pause_time_ms: 1.2,
      gc_suspension_time_ms: 0.8,
      gc_heap_size_mb: 128.4,
      gc_gen0_count: 342,
      gc_gen1_count: 87,
      gc_gen2_count: 12,
      gc_fragmentation_pct: 18.3,
      aot_reflection_warnings: 5,
      aot_trimming_warnings: 3,
      jit_compiled_methods: 0,
      memory_working_set_mb: 156.2,
      collected_at: '2026-03-26T09:15:00Z',
    },
    {
      agent_id: 'dn-agent-002',
      hostname: 'api-prod-02',
      dotnet_version: '.NET 9.0-aot',
      is_native_aot: true,
      threadpool_threads: 16,
      threadpool_queue_length: 7,
      threadpool_completed: 295410,
      threadpool_starvation_count: 0,
      gc_pause_time_ms: 2.1,
      gc_suspension_time_ms: 1.4,
      gc_heap_size_mb: 256.8,
      gc_gen0_count: 521,
      gc_gen1_count: 134,
      gc_gen2_count: 28,
      gc_fragmentation_pct: 42.1,
      aot_reflection_warnings: 8,
      aot_trimming_warnings: 6,
      jit_compiled_methods: 0,
      memory_working_set_mb: 298.5,
      collected_at: '2026-03-26T09:15:00Z',
    },
    {
      agent_id: 'dn-agent-003',
      hostname: 'worker-01',
      dotnet_version: '.NET 8.0',
      is_native_aot: false,
      threadpool_threads: 24,
      threadpool_queue_length: 12,
      threadpool_completed: 412300,
      threadpool_starvation_count: 5,
      gc_pause_time_ms: 4.8,
      gc_suspension_time_ms: 3.2,
      gc_heap_size_mb: 512.6,
      gc_gen0_count: 890,
      gc_gen1_count: 245,
      gc_gen2_count: 56,
      gc_fragmentation_pct: 55.4,
      aot_reflection_warnings: 0,
      aot_trimming_warnings: 0,
      jit_compiled_methods: 14520,
      memory_working_set_mb: 620.3,
      collected_at: '2026-03-26T09:15:00Z',
    },
    {
      agent_id: 'dn-agent-004',
      hostname: 'svc-prod-03',
      dotnet_version: '.NET 9.0',
      is_native_aot: false,
      threadpool_threads: 8,
      threadpool_queue_length: 0,
      threadpool_completed: 98200,
      threadpool_starvation_count: 0,
      gc_pause_time_ms: 0.9,
      gc_suspension_time_ms: 0.5,
      gc_heap_size_mb: 64.2,
      gc_gen0_count: 156,
      gc_gen1_count: 42,
      gc_gen2_count: 6,
      gc_fragmentation_pct: 12.8,
      aot_reflection_warnings: 0,
      aot_trimming_warnings: 0,
      jit_compiled_methods: 8340,
      memory_working_set_mb: 82.1,
      collected_at: '2026-03-26T09:15:00Z',
    },
    {
      agent_id: 'dn-agent-005',
      hostname: 'bg-worker-02',
      dotnet_version: '.NET 8.0',
      is_native_aot: false,
      threadpool_threads: 32,
      threadpool_queue_length: 15,
      threadpool_completed: 567800,
      threadpool_starvation_count: 8,
      gc_pause_time_ms: 6.3,
      gc_suspension_time_ms: 4.1,
      gc_heap_size_mb: 768.9,
      gc_gen0_count: 1240,
      gc_gen1_count: 380,
      gc_gen2_count: 82,
      gc_fragmentation_pct: 34.7,
      aot_reflection_warnings: 0,
      aot_trimming_warnings: 0,
      jit_compiled_methods: 21450,
      memory_working_set_mb: 890.4,
      collected_at: '2026-03-26T09:15:00Z',
    },
  ];
}

// ── AOT Warning Items ────────────────────────────────────────────────────────
interface AOTWarning {
  agent: string;
  hostname: string;
  type: 'reflection' | 'trimming';
  message: string;
  severity: 'warning' | 'error';
}

function generateAOTWarnings(): AOTWarning[] {
  return [
    { agent: 'dn-agent-001', hostname: 'web-prod-01', type: 'reflection', message: 'System.Text.Json: Dynamic serialization of IEnumerable<T> uses MakeGenericType at runtime', severity: 'warning' },
    { agent: 'dn-agent-001', hostname: 'web-prod-01', type: 'trimming', message: 'Assembly Microsoft.Extensions.DependencyInjection: Method GetService<T>() requires unreferenced code', severity: 'error' },
    { agent: 'dn-agent-001', hostname: 'web-prod-01', type: 'reflection', message: 'Newtonsoft.Json.JsonConvert: Type.GetProperties() called on unregistered type CustomerDto', severity: 'warning' },
    { agent: 'dn-agent-001', hostname: 'web-prod-01', type: 'trimming', message: 'Assembly AutoMapper: MapperConfiguration uses Expression.Compile() which is not AOT-compatible', severity: 'error' },
    { agent: 'dn-agent-001', hostname: 'web-prod-01', type: 'reflection', message: 'System.ComponentModel.DataAnnotations: Attribute resolution via reflection on OrderModel', severity: 'warning' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'reflection', message: 'MediatR: Handler resolution uses Activator.CreateInstance for IRequestHandler<,>', severity: 'error' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'trimming', message: 'Assembly Serilog.Sinks.Console: Dynamic sink binding uses Assembly.Load()', severity: 'warning' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'reflection', message: 'FluentValidation: PropertyRule<T> invokes Expression.Lambda at runtime', severity: 'warning' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'trimming', message: 'Assembly Grpc.AspNetCore: gRPC service binding trims unreferenced method stubs', severity: 'error' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'reflection', message: 'System.Linq.Expressions: LambdaExpression.Compile() not supported in Native AOT', severity: 'error' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'reflection', message: 'Dapper: SqlMapper uses Emit-based IL generation for parameter binding', severity: 'warning' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'trimming', message: 'Assembly Microsoft.AspNetCore.Routing: Route constraint resolution trims endpoint metadata', severity: 'warning' },
    { agent: 'dn-agent-002', hostname: 'api-prod-02', type: 'trimming', message: 'Assembly StackExchange.Redis: Connection multiplexer uses dynamic proxy generation', severity: 'error' },
  ];
}

// ── ThreadPool Time-series ───────────────────────────────────────────────────
function generateThreadPoolTimeSeries(): { time: string[]; threads: Record<string, number[]>; queue: Record<string, number[]> } {
  const points = 12;
  const time = Array.from({ length: points }, (_, i) => {
    const h = 9 + Math.floor(i * 0.5);
    const m = (i % 2) * 30;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const hosts = ['web-prod-01', 'api-prod-02', 'worker-01', 'svc-prod-03', 'bg-worker-02'];
  const baseThreads = [12, 16, 24, 8, 32];
  const baseQueue = [3, 7, 12, 0, 15];

  const threads: Record<string, number[]> = {};
  const queue: Record<string, number[]> = {};

  hosts.forEach((h, idx) => {
    threads[h] = Array.from({ length: points }, (_, i) => Math.max(4, baseThreads[idx] + Math.round(Math.sin(i * 0.8 + idx) * 4)));
    queue[h] = Array.from({ length: points }, (_, i) => Math.max(0, baseQueue[idx] + Math.round(Math.sin(i * 0.6 + idx * 2) * 3)));
  });

  return { time, threads, queue };
}

// ── Color helpers ────────────────────────────────────────────────────────────
function fragColor(pct: number): string {
  if (pct > 50) return '#F85149';
  if (pct > 30) return '#D29922';
  return 'var(--text-primary)';
}

function starvationColor(count: number): string {
  return count > 0 ? '#F85149' : 'var(--text-primary)';
}

const AGENT_COLORS = ['#58A6FF', '#3FB950', '#F85149', '#D29922', '#A371F7'];

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function DotNetRuntimePage() {
  const demoAgents = useCallback(() => generateDemoAgents(), []);
  const { data: agentsResult, source } = useDataSource('/runtime/dotnet/metrics', demoAgents, { refreshInterval: 30_000 });
  const agents = Array.isArray(agentsResult) ? agentsResult : (agentsResult as any)?.items ?? generateDemoAgents();
  const warnings = useMemo(() => generateAOTWarnings(), []);
  const tpSeries = useMemo(() => generateThreadPoolTimeSeries(), []);

  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  // ── Filtered agents ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (modeFilter === 'aot' && !a.is_native_aot) return false;
      if (modeFilter === 'jit' && a.is_native_aot) return false;
      if (search) {
        const term = search.toLowerCase();
        if (
          !a.hostname.toLowerCase().includes(term) &&
          !a.dotnet_version.toLowerCase().includes(term) &&
          !a.agent_id.toLowerCase().includes(term)
        ) return false;
      }
      return true;
    });
  }, [agents, modeFilter, search]);

  // ── KPI aggregations ────────────────────────────────────────────────────
  const totalStarvation = useMemo(() => agents.reduce((s, a) => s + a.threadpool_starvation_count, 0), [agents]);
  const avgSuspension = useMemo(() => {
    const sum = agents.reduce((s, a) => s + a.gc_suspension_time_ms, 0);
    return agents.length > 0 ? (sum / agents.length).toFixed(1) : '0';
  }, [agents]);
  const avgHeap = useMemo(() => {
    const sum = agents.reduce((s, a) => s + a.gc_heap_size_mb, 0);
    return agents.length > 0 ? (sum / agents.length).toFixed(0) : '0';
  }, [agents]);
  const totalAOTWarnings = useMemo(() => {
    return agents.reduce((s, a) => s + a.aot_reflection_warnings + a.aot_trimming_warnings, 0);
  }, [agents]);

  // ── ThreadPool Chart Option ─────────────────────────────────────────────
  const threadPoolOption = useMemo<EChartsOption>(() => {
    const hosts = Object.keys(tpSeries.threads);
    const threadSeries = hosts.map((h, i) => ({
      name: `${h} (threads)`,
      type: 'line' as const,
      data: tpSeries.threads[h],
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2 },
      itemStyle: { color: AGENT_COLORS[i % AGENT_COLORS.length] },
    }));
    const queueSeries = hosts.map((h, i) => ({
      name: `${h} (queue)`,
      type: 'line' as const,
      data: tpSeries.queue[h],
      smooth: true,
      symbol: 'diamond',
      symbolSize: 4,
      lineStyle: { width: 1.5, type: 'dashed' as const },
      itemStyle: { color: AGENT_COLORS[i % AGENT_COLORS.length], opacity: 0.6 },
    }));
    return {
      tooltip: { trigger: 'axis' },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: { color: '#8B949E', fontSize: 10 },
        pageTextStyle: { color: '#8B949E' },
      },
      grid: { left: 48, right: 16, top: 16, bottom: 48 },
      xAxis: {
        type: 'category',
        data: tpSeries.time,
        axisLabel: { color: '#8B949E', fontSize: 10 },
        axisLine: { lineStyle: { color: '#30363D' } },
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameTextStyle: { color: '#8B949E', fontSize: 10 },
        axisLabel: { color: '#8B949E', fontSize: 10 },
        splitLine: { lineStyle: { color: '#21262D' } },
      },
      series: [...threadSeries, ...queueSeries],
    };
  }, [tpSeries]);

  // ── GC Chart Option ─────────────────────────────────────────────────────
  const gcOption = useMemo<EChartsOption>(() => {
    const hostnames = agents.map(a => a.hostname);
    return {
      tooltip: { trigger: 'axis' },
      legend: {
        bottom: 0,
        textStyle: { color: '#8B949E', fontSize: 10 },
      },
      grid: { left: 48, right: 16, top: 16, bottom: 40 },
      xAxis: {
        type: 'category',
        data: hostnames,
        axisLabel: { color: '#8B949E', fontSize: 10, rotate: 15 },
        axisLine: { lineStyle: { color: '#30363D' } },
      },
      yAxis: {
        type: 'value',
        name: 'Collections',
        nameTextStyle: { color: '#8B949E', fontSize: 10 },
        axisLabel: { color: '#8B949E', fontSize: 10 },
        splitLine: { lineStyle: { color: '#21262D' } },
      },
      series: [
        {
          name: 'Gen 0',
          type: 'bar',
          stack: 'gc',
          data: agents.map(a => a.gc_gen0_count),
          itemStyle: { color: '#58A6FF' },
          barMaxWidth: 32,
        },
        {
          name: 'Gen 1',
          type: 'bar',
          stack: 'gc',
          data: agents.map(a => a.gc_gen1_count),
          itemStyle: { color: '#D29922' },
          barMaxWidth: 32,
        },
        {
          name: 'Gen 2',
          type: 'bar',
          stack: 'gc',
          data: agents.map(a => a.gc_gen2_count),
          itemStyle: { color: '#F85149' },
          barMaxWidth: 32,
        },
      ],
    };
  }, [agents]);

  // ── Filtered AOT Warnings ──────────────────────────────────────────────
  const filteredWarnings = useMemo(() => {
    if (!modeFilter && !search) return warnings;
    return warnings.filter(w => {
      if (modeFilter === 'jit') return false; // AOT warnings only on AOT agents
      if (search) {
        const term = search.toLowerCase();
        if (!w.hostname.toLowerCase().includes(term) && !w.message.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [warnings, modeFilter, search]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Runtime', href: '/runtime' },
          { label: '.NET', icon: <Server size={14} /> },
        ]}
      />

      {/* ── Title ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">.NET Runtime Monitor</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Native AOT compilation analysis, ThreadPool starvation detection, and GC suspension monitoring
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="ThreadPool Starvation Events"
          value={totalStarvation}
          subtitle="across all agents"
          status={totalStarvation > 5 ? 'critical' : totalStarvation > 0 ? 'warning' : 'healthy'}
          sparkData={[0, 1, 0, 3, 2, 5, 4, 8, 6, 15]}
        />
        <KPICard
          title="GC Suspension Time"
          value={avgSuspension}
          unit="ms"
          subtitle="avg across agents"
          status={Number(avgSuspension) > 5 ? 'critical' : Number(avgSuspension) > 2 ? 'warning' : 'healthy'}
          sparkData={[1.2, 1.5, 0.8, 2.1, 1.8, 2.0, 1.6, 2.4, 1.9, 2.0]}
        />
        <KPICard
          title="Avg Heap Size"
          value={avgHeap}
          unit="MB"
          subtitle="managed heap"
          status={Number(avgHeap) > 500 ? 'warning' : 'healthy'}
          sparkData={[280, 310, 295, 340, 320, 346, 330, 350, 342, 346]}
        />
        <KPICard
          title="AOT Warnings"
          value={totalAOTWarnings}
          subtitle="reflection + trimming"
          status={totalAOTWarnings > 10 ? 'critical' : totalAOTWarnings > 0 ? 'warning' : 'healthy'}
          sparkData={[3, 5, 4, 8, 7, 10, 12, 15, 18, 22]}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          options={MODE_OPTIONS}
          value={modeFilter}
          onChange={e => setModeFilter(e.target.value)}
          aria-label="Filter by runtime mode"
        />
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search hostname..."
          className="w-48"
        />
        <span className="text-xs text-[var(--text-muted)] ml-auto">
          {filtered.length} agent{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Agent Table ────────────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Hostname</th>
                <th className="text-left px-4 py-2.5 font-medium">.NET Version</th>
                <th className="text-center px-4 py-2.5 font-medium">AOT</th>
                <th className="text-right px-4 py-2.5 font-medium">TP Threads</th>
                <th className="text-right px-4 py-2.5 font-medium">Queue Len</th>
                <th className="text-right px-4 py-2.5 font-medium">Starvation</th>
                <th className="text-right px-4 py-2.5 font-medium">GC Pause</th>
                <th className="text-right px-4 py-2.5 font-medium">GC Heap</th>
                <th className="text-right px-4 py-2.5 font-medium">Frag%</th>
                <th className="text-right px-4 py-2.5 font-medium">Working Set</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(agent => (
                <tr
                  key={agent.agent_id}
                  className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-[var(--text-primary)] font-medium text-xs">{agent.hostname}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: agent.is_native_aot ? '#512BD420' : '#58A6FF20',
                        color: agent.is_native_aot ? '#512BD4' : '#58A6FF',
                      }}
                    >
                      {agent.dotnet_version}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs">
                    {agent.is_native_aot ? (
                      <span title="Native AOT">🟣 Native AOT</span>
                    ) : (
                      <span className="text-[var(--text-muted)]" title="JIT">⚪ JIT</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                    {agent.threadpool_threads}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                    {agent.threadpool_queue_length}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium" style={{ color: starvationColor(agent.threadpool_starvation_count) }}>
                    {agent.threadpool_starvation_count}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                    {agent.gc_pause_time_ms.toFixed(1)} ms
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                    {agent.gc_heap_size_mb.toFixed(1)} MB
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium" style={{ color: fragColor(agent.gc_fragmentation_pct) }}>
                    {agent.gc_fragmentation_pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                    {agent.memory_working_set_mb.toFixed(0)} MB
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                    No agents found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Charts Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ThreadPool Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-[#58A6FF]" />
              <CardTitle className="text-sm">ThreadPool — Threads &amp; Queue Length</CardTitle>
            </div>
          </CardHeader>
          <EChartsWrapper option={threadPoolOption} height={280} />
        </Card>

        {/* GC Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MemoryStick size={14} className="text-[#3FB950]" />
              <CardTitle className="text-sm">GC Collections by Generation</CardTitle>
            </div>
          </CardHeader>
          <EChartsWrapper option={gcOption} height={280} />
        </Card>
      </div>

      {/* ── AOT Warnings Panel ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-[#512BD4]" />
              <CardTitle className="text-sm">AOT Restriction Warnings</CardTitle>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {filteredWarnings.length} warning{filteredWarnings.length !== 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>

        <div className="space-y-1.5 px-4 pb-4">
          {filteredWarnings.length === 0 && (
            <div className="text-center py-6 text-[var(--text-muted)] text-sm">
              No AOT warnings to display
            </div>
          )}
          {filteredWarnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 rounded-md border transition-colors"
              style={{
                borderColor: w.severity === 'error' ? 'rgba(248,81,73,0.3)' : 'rgba(210,153,34,0.3)',
                backgroundColor: w.severity === 'error' ? 'rgba(248,81,73,0.06)' : 'rgba(210,153,34,0.06)',
              }}
            >
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: w.severity === 'error' ? '#F85149' : '#D29922' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{w.hostname}</span>
                  <span
                    className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: w.type === 'reflection' ? '#A371F720' : '#512BD420',
                      color: w.type === 'reflection' ? '#A371F7' : '#512BD4',
                    }}
                  >
                    {w.type === 'reflection' ? 'Reflection' : 'Trimming'}
                  </span>
                  <span
                    className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: w.severity === 'error' ? '#F8514920' : '#D2992220',
                      color: w.severity === 'error' ? '#F85149' : '#D29922',
                    }}
                  >
                    {w.severity}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed break-words">
                  {w.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
