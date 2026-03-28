'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, SearchInput, Select, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import type { PythonRuntimeMetrics } from '@/types/monitoring';
import type { EChartsOption } from 'echarts';
import {
  Cpu,
  Activity,
  Clock,
  Layers,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

const VERSION_OPTIONS = [
  { label: 'All Versions', value: '' },
  { label: 'Python 3.11', value: '3.11' },
  { label: 'Python 3.12', value: '3.12' },
  { label: 'Python 3.13-ft', value: '3.13-ft' },
];

function generateDemoData(): PythonRuntimeMetrics[] {
  return [
    {
      agent_id: 'agent-py-001',
      hostname: 'ml-worker-01',
      python_version: '3.13.1-ft',
      is_free_threaded: true,
      gil_contention_pct: 0,
      free_thread_utilization_pct: 78.4,
      active_threads: 24,
      asyncio_tasks_pending: 12,
      asyncio_tasks_running: 8,
      gc_gen0_collections: 1420,
      gc_gen1_collections: 142,
      gc_gen2_collections: 14,
      gc_gen0_time_ms: 4.2,
      gc_gen1_time_ms: 8.7,
      gc_gen2_time_ms: 22.1,
      gc_total_pause_ms: 35.0,
      memory_rss_mb: 2048,
      collected_at: new Date().toISOString(),
    },
    {
      agent_id: 'agent-py-002',
      hostname: 'api-server-02',
      python_version: '3.12.4',
      is_free_threaded: false,
      gil_contention_pct: 34.2,
      free_thread_utilization_pct: 0,
      active_threads: 8,
      asyncio_tasks_pending: 45,
      asyncio_tasks_running: 12,
      gc_gen0_collections: 2800,
      gc_gen1_collections: 280,
      gc_gen2_collections: 28,
      gc_gen0_time_ms: 8.5,
      gc_gen1_time_ms: 15.3,
      gc_gen2_time_ms: 42.6,
      gc_total_pause_ms: 66.4,
      memory_rss_mb: 1536,
      collected_at: new Date().toISOString(),
    },
    {
      agent_id: 'agent-py-003',
      hostname: 'inference-gpu-03',
      python_version: '3.13.1-ft',
      is_free_threaded: true,
      gil_contention_pct: 0,
      free_thread_utilization_pct: 82.1,
      active_threads: 32,
      asyncio_tasks_pending: 6,
      asyncio_tasks_running: 4,
      gc_gen0_collections: 980,
      gc_gen1_collections: 98,
      gc_gen2_collections: 10,
      gc_gen0_time_ms: 3.1,
      gc_gen1_time_ms: 6.4,
      gc_gen2_time_ms: 18.5,
      gc_total_pause_ms: 28.0,
      memory_rss_mb: 4096,
      collected_at: new Date().toISOString(),
    },
    {
      agent_id: 'agent-py-004',
      hostname: 'data-pipeline-04',
      python_version: '3.12.4',
      is_free_threaded: false,
      gil_contention_pct: 42.8,
      free_thread_utilization_pct: 0,
      active_threads: 12,
      asyncio_tasks_pending: 78,
      asyncio_tasks_running: 16,
      gc_gen0_collections: 3600,
      gc_gen1_collections: 360,
      gc_gen2_collections: 36,
      gc_gen0_time_ms: 11.2,
      gc_gen1_time_ms: 19.8,
      gc_gen2_time_ms: 55.3,
      gc_total_pause_ms: 86.3,
      memory_rss_mb: 3072,
      collected_at: new Date().toISOString(),
    },
    {
      agent_id: 'agent-py-005',
      hostname: 'scheduler-05',
      python_version: '3.11.9',
      is_free_threaded: false,
      gil_contention_pct: 18.5,
      free_thread_utilization_pct: 0,
      active_threads: 4,
      asyncio_tasks_pending: 22,
      asyncio_tasks_running: 6,
      gc_gen0_collections: 1800,
      gc_gen1_collections: 180,
      gc_gen2_collections: 18,
      gc_gen0_time_ms: 5.8,
      gc_gen1_time_ms: 10.2,
      gc_gen2_time_ms: 30.1,
      gc_total_pause_ms: 46.1,
      memory_rss_mb: 768,
      collected_at: new Date().toISOString(),
    },
  ];
}

export default function PythonRuntimePage() {
  const demoData = useCallback(() => generateDemoData(), []);
  const { data: agentsResult, source } = useDataSource('/runtime/python/metrics', demoData, { refreshInterval: 30_000 });
  const agents = Array.isArray(agentsResult) ? agentsResult : (agentsResult as any)?.items ?? generateDemoData();
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState('');

  // --- KPI aggregations ---
  const ftAgents = agents.filter(a => a.is_free_threaded);
  const gilAgents = agents.filter(a => !a.is_free_threaded);

  const avgGilContention = gilAgents.length > 0
    ? Math.round(gilAgents.reduce((s, a) => s + a.gil_contention_pct, 0) / gilAgents.length * 10) / 10
    : 0;
  const avgFtUtilization = ftAgents.length > 0
    ? Math.round(ftAgents.reduce((s, a) => s + a.free_thread_utilization_pct, 0) / ftAgents.length * 10) / 10
    : 0;
  const totalThreads = agents.reduce((s, a) => s + a.active_threads, 0);
  const totalAsyncPending = agents.reduce((s, a) => s + a.asyncio_tasks_pending, 0);
  const avgGcPause = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + a.gc_total_pause_ms, 0) / agents.length * 10) / 10
    : 0;

  // --- Filtered agents ---
  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (search && !a.hostname.toLowerCase().includes(search.toLowerCase())) return false;
      if (versionFilter === '3.13-ft' && !a.is_free_threaded) return false;
      if (versionFilter === '3.12' && !a.python_version.startsWith('3.12')) return false;
      if (versionFilter === '3.11' && !a.python_version.startsWith('3.11')) return false;
      return true;
    });
  }, [agents, search, versionFilter]);

  // --- GC Stacked Bar Chart ---
  const gcChartOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as Array<{ seriesName: string; value: number; color: string }>;
        const name = (params as Array<{ axisValue: string }>)[0]?.axisValue ?? '';
        let html = `<div style="font-size:12px"><strong>${name}</strong>`;
        let total = 0;
        items.forEach(item => {
          html += `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:4px"></span>${item.seriesName}: ${item.value.toFixed(1)} ms`;
          total += item.value;
        });
        html += `<br/><strong>Total: ${total.toFixed(1)} ms</strong></div>`;
        return html;
      },
    },
    legend: {
      data: ['Gen0', 'Gen1', 'Gen2'],
      top: 0,
      right: 0,
      textStyle: { color: '#8B949E', fontSize: 11 },
    },
    grid: { left: 48, right: 16, top: 32, bottom: 32 },
    xAxis: {
      type: 'category',
      data: agents.map(a => a.hostname),
      axisLabel: { color: '#8B949E', fontSize: 11, rotate: 0 },
    },
    yAxis: {
      type: 'value',
      name: 'ms',
      nameTextStyle: { color: '#8B949E', fontSize: 11 },
      axisLabel: { color: '#8B949E', fontSize: 11 },
    },
    series: [
      {
        name: 'Gen0',
        type: 'bar',
        stack: 'gc',
        data: agents.map(a => a.gc_gen0_time_ms),
        itemStyle: { color: '#58A6FF' },
        barMaxWidth: 40,
      },
      {
        name: 'Gen1',
        type: 'bar',
        stack: 'gc',
        data: agents.map(a => a.gc_gen1_time_ms),
        itemStyle: { color: '#D29922' },
        barMaxWidth: 40,
      },
      {
        name: 'Gen2',
        type: 'bar',
        stack: 'gc',
        data: agents.map(a => a.gc_gen2_time_ms),
        itemStyle: { color: '#F85149' },
        barMaxWidth: 40,
      },
    ],
  }), [agents]);

  // --- Asyncio Pending Tasks Line Chart (12 data points) ---
  const asyncioChartOption = useMemo<EChartsOption>(() => {
    const timeLabels = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - (11 - i) * 5);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    });

    // Generate realistic trending data per agent
    const seriesData: Record<string, number[]> = {
      'ml-worker-01':      [8, 10, 12, 14, 11, 9, 12, 15, 13, 10, 11, 12],
      'api-server-02':     [30, 35, 42, 48, 45, 38, 40, 50, 55, 48, 42, 45],
      'inference-gpu-03':  [4, 5, 6, 8, 7, 5, 4, 6, 7, 5, 6, 6],
      'data-pipeline-04':  [60, 65, 72, 80, 78, 70, 68, 75, 82, 78, 74, 78],
      'scheduler-05':      [18, 20, 22, 25, 24, 20, 18, 22, 26, 24, 22, 22],
    };

    const colors = ['#58A6FF', '#3FB950', '#A371F7', '#F85149', '#D29922'];

    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = params as Array<{ seriesName: string; value: number; color: string }>;
          const time = (params as Array<{ axisValue: string }>)[0]?.axisValue ?? '';
          let html = `<div style="font-size:12px"><strong>${time}</strong>`;
          items.forEach(item => {
            html += `<br/><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:4px"></span>${item.seriesName}: ${item.value}`;
          });
          html += '</div>';
          return html;
        },
      },
      legend: {
        data: agents.map(a => a.hostname),
        top: 0,
        right: 0,
        textStyle: { color: '#8B949E', fontSize: 11 },
      },
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLabel: { color: '#8B949E', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: 'Pending Tasks',
        nameTextStyle: { color: '#8B949E', fontSize: 11 },
        axisLabel: { color: '#8B949E', fontSize: 11 },
      },
      series: agents.map((a, i) => ({
        name: a.hostname,
        type: 'line' as const,
        data: seriesData[a.hostname] ?? [],
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2, color: colors[i % colors.length] },
        itemStyle: { color: colors[i % colors.length] },
      })),
    };
  }, [agents]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Runtime', href: '/runtime' },
          { label: 'Python', icon: <Cpu size={14} /> },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Python Runtime Monitor</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          GIL contention analysis and Free-Threaded mode monitoring for Python 3.13+ runtimes
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          helpId="python-gil-contention"
          title="GIL Contention / FT Utilization"
          value={ftAgents.length > 0 ? `${avgFtUtilization}%` : `${avgGilContention}%`}
          subtitle={ftAgents.length > 0
            ? `FT avg across ${ftAgents.length} agents`
            : `GIL avg across ${gilAgents.length} agents`
          }
          status={avgGilContention > 40 ? 'critical' : avgGilContention > 25 ? 'warning' : 'healthy'}
          sparkData={[28, 32, 35, 30, 34, 31, avgGilContention]}
        />
        <KPICard
          helpId="python-active-threads"
          title="Active Threads"
          value={totalThreads}
          subtitle={`Across ${agents.length} agents`}
          sparkData={[60, 65, 72, 78, 75, 80, totalThreads]}
        />
        <KPICard
          helpId="python-asyncio-pending"
          title="Asyncio Pending Tasks"
          value={totalAsyncPending}
          subtitle="Total pending across all agents"
          status={totalAsyncPending > 150 ? 'warning' : 'healthy'}
          sparkData={[120, 135, 148, 155, 142, 158, totalAsyncPending]}
        />
        <KPICard
          helpId="python-gc-pause"
          title="GC Total Pause (avg)"
          value={`${avgGcPause}`}
          unit="ms"
          subtitle="Average per agent"
          status={avgGcPause > 80 ? 'critical' : avgGcPause > 50 ? 'warning' : 'healthy'}
          sparkData={[40, 45, 52, 48, 55, 50, avgGcPause]}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="w-64"
        />
        <Select
          options={VERSION_OPTIONS}
          value={versionFilter}
          onChange={e => setVersionFilter(e.target.value)}
          aria-label="Python version filter"
        />
        <div className="ml-auto text-xs text-[var(--text-muted)]">
          <span className="tabular-nums font-medium text-[var(--text-primary)]">{ftAgents.length}</span> Free-Threaded
          {' / '}
          <span className="tabular-nums font-medium text-[var(--text-primary)]">{gilAgents.length}</span> GIL agents
        </div>
      </div>

      {/* Agent Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Hostname</th>
                <th className="text-left px-4 py-2.5 font-medium">Python Version</th>
                <th className="text-left px-4 py-2.5 font-medium">Threading Mode</th>
                <th className="text-right px-4 py-2.5 font-medium">GIL / FT %</th>
                <th className="text-right px-4 py-2.5 font-medium">Threads</th>
                <th className="text-right px-4 py-2.5 font-medium">Asyncio Tasks</th>
                <th className="text-right px-4 py-2.5 font-medium">GC Pause</th>
                <th className="text-right px-4 py-2.5 font-medium">Memory</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(agent => {
                const gilFtValue = agent.is_free_threaded
                  ? agent.free_thread_utilization_pct
                  : agent.gil_contention_pct;
                const gilFtColor = agent.is_free_threaded
                  ? '#3FB950'
                  : gilFtValue > 40 ? '#F85149' : gilFtValue > 25 ? '#D29922' : '#3FB950';

                return (
                  <tr
                    key={agent.agent_id}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[var(--text-primary)] font-medium">{agent.hostname}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-[var(--text-secondary)] font-mono">
                        {agent.python_version}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {agent.is_free_threaded ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: 'rgba(63,185,80,0.12)', color: '#3FB950' }}
                        >
                          <span className="text-[10px]">{'\u{1F7E2}'}</span>
                          Free-Threaded
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: 'rgba(139,148,158,0.12)', color: '#8B949E' }}
                        >
                          <span className="text-[10px]">{'\u{1F534}'}</span>
                          GIL
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="text-xs tabular-nums font-medium"
                        style={{ color: gilFtColor }}
                      >
                        {gilFtValue.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {agent.active_threads}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {agent.asyncio_tasks_pending}
                      <span className="text-[var(--text-muted)] ml-1">
                        / {agent.asyncio_tasks_running} running
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="text-xs tabular-nums font-medium"
                        style={{
                          color: agent.gc_total_pause_ms > 80 ? '#F85149'
                            : agent.gc_total_pause_ms > 50 ? '#D29922'
                            : '#3FB950',
                        }}
                      >
                        {agent.gc_total_pause_ms.toFixed(1)} ms
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {agent.memory_rss_mb >= 1024
                        ? `${(agent.memory_rss_mb / 1024).toFixed(1)} GB`
                        : `${agent.memory_rss_mb} MB`
                      }
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                    No Python agents found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* GC Details Chart */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-[var(--text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">GC Collection Time by Agent</h2>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#58A6FF' }} />
              Gen0
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D29922' }} />
              Gen1
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F85149' }} />
              Gen2
            </span>
          </div>
        </div>
        <EChartsWrapper option={gcChartOption} height={280} />
      </Card>

      {/* Asyncio Pending Tasks Chart */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[var(--text-secondary)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Asyncio Pending Tasks Over Time</h2>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Clock size={11} />
            Last 60 min (5-min intervals)
          </div>
        </div>
        <EChartsWrapper option={asyncioChartOption} height={280} />
      </Card>
    </div>
  );
}
