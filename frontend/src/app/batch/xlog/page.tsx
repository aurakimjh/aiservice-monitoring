'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Select } from '@/components/ui';
import { getBatchXLogData, getBatchJobs } from '@/lib/demo-data';
import type { EChartsOption } from 'echarts';
import type { BatchXLogPoint } from '@/types/monitoring';
import {
  Timer,
  ScatterChart,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

const STATUS_COLORS: Record<string, string> = {
  success: '#3FB950',
  failed: '#F85149',
  slow: '#D29922',
};

const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 14 days', value: '14' },
  { label: 'Last 30 days', value: '30' },
];

const LANG_OPTIONS = [
  { label: 'All Languages', value: '' },
  { label: 'Java', value: 'java' },
  { label: 'Python', value: 'python' },
  { label: 'Go', value: 'go' },
  { label: 'Shell', value: 'shell' },
];

export default function BatchXLogPage() {
  const router = useRouter();
  const jobs = useMemo(() => getBatchJobs(), []);
  const allData = useMemo(() => getBatchXLogData(), []);

  const [jobFilter, setJobFilter] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [langFilter, setLangFilter] = useState('');
  const [slaThreshold, setSlaThreshold] = useState(60);

  const jobOptions = useMemo(() => [
    { label: 'All Jobs', value: '' },
    ...jobs.map(j => ({ label: j.name, value: j.name })),
  ], [jobs]);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - parseInt(dateRange) * 86_400_000;
    return allData.filter(p => {
      if (new Date(p.started_at).getTime() < cutoff) return false;
      if (jobFilter && p.job_name !== jobFilter) return false;
      if (langFilter) {
        const job = jobs.find(j => j.name === p.job_name);
        if (job && job.language !== langFilter) return false;
      }
      return true;
    });
  }, [allData, jobFilter, dateRange, langFilter, jobs]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter(p => p.status === 'success').length;
    const failed = filtered.filter(p => p.status === 'failed').length;
    const slow = filtered.filter(p => p.status === 'slow').length;
    const avgDuration = total > 0 ? filtered.reduce((s, p) => s + p.duration_min, 0) / total : 0;
    return { total, success, failed, slow, avgDuration };
  }, [filtered]);

  const chartOption = useMemo<EChartsOption>(() => {
    const seriesData: Record<string, { value: [number, number]; symbolSize: number; point: BatchXLogPoint }[]> = {
      success: [],
      failed: [],
      slow: [],
    };

    filtered.forEach(p => {
      const ts = new Date(p.started_at).getTime();
      const size = Math.min(Math.max(Math.sqrt(p.io_total / 100_000_000) * 3, 4), 20);
      const bucket = seriesData[p.status] || seriesData.success;
      bucket.push({
        value: [ts, p.duration_min],
        symbolSize: size,
        point: p,
      });
    });

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { data: { point: BatchXLogPoint } };
          const pt = p.data.point;
          return `<div style="font-size:12px">
            <strong>${pt.job_name}</strong><br/>
            Status: ${pt.status}<br/>
            Duration: ${pt.duration_min.toFixed(1)} min<br/>
            ${new Date(pt.started_at).toLocaleString()}<br/>
            <span style="color:#8B949E">Click to view detail</span>
          </div>`;
        },
      },
      legend: {
        show: true,
        bottom: 0,
        textStyle: { color: '#8B949E', fontSize: 11 },
        data: [
          { name: 'Success', icon: 'circle' },
          { name: 'Failed', icon: 'circle' },
          { name: 'Slow', icon: 'circle' },
        ],
      },
      xAxis: {
        type: 'time',
        name: 'Execution Start Time',
        nameTextStyle: { color: '#8B949E', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Duration (min)',
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
        min: 0,
      },
      grid: { left: 56, right: 16, top: 16, bottom: 48 },
      series: [
        {
          name: 'Success',
          type: 'scatter',
          data: seriesData.success,
          itemStyle: { color: STATUS_COLORS.success },
        },
        {
          name: 'Failed',
          type: 'scatter',
          data: seriesData.failed,
          itemStyle: { color: STATUS_COLORS.failed },
        },
        {
          name: 'Slow',
          type: 'scatter',
          data: seriesData.slow,
          itemStyle: { color: STATUS_COLORS.slow },
        },
        // SLA threshold line
        {
          name: 'SLA Threshold',
          type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#F85149', type: 'dashed', width: 1 },
            data: [{
              yAxis: slaThreshold,
              label: { formatter: `SLA ${slaThreshold}min`, color: '#F85149', fontSize: 10 },
            }],
          },
          data: [],
        },
      ],
    };
  }, [filtered, slaThreshold]);

  const handleChartInit = useCallback((chart: ReturnType<typeof import('echarts/core').init>) => {
    chart.on('click', (params: unknown) => {
      const p = params as { data?: { point?: BatchXLogPoint } };
      if (p.data?.point?.execution_id) {
        // Navigate to real execution IDs, or job detail for generated IDs
        if (p.data.point.execution_id.startsWith('bexec-')) {
          router.push(`/batch/executions/${p.data.point.execution_id}`);
        } else {
          router.push(`/batch/${encodeURIComponent(p.data.point.job_name)}`);
        }
      }
    });
  }, [router]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
        { label: 'XLog', icon: <ScatterChart size={14} /> },
      ]} />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Batch XLog</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Scatter plot of batch executions: start time vs duration
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Total Points</div>
          <div className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{stats.total}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Success</div>
          <div className="text-xl font-bold tabular-nums" style={{ color: '#3FB950' }}>{stats.success}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Failed</div>
          <div className="text-xl font-bold tabular-nums" style={{ color: '#F85149' }}>{stats.failed}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Slow</div>
          <div className="text-xl font-bold tabular-nums" style={{ color: '#D29922' }}>{stats.slow}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-3">
          <div className="text-[11px] text-[var(--text-muted)]">Avg Duration</div>
          <div className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{stats.avgDuration.toFixed(1)}m</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          options={jobOptions}
          value={jobFilter}
          onChange={e => setJobFilter(e.target.value)}
          aria-label="Job filter"
        />
        <Select
          options={DATE_RANGE_OPTIONS}
          value={dateRange}
          onChange={e => setDateRange(e.target.value)}
          aria-label="Date range"
        />
        <Select
          options={LANG_OPTIONS}
          value={langFilter}
          onChange={e => setLangFilter(e.target.value)}
          aria-label="Language filter"
        />
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[var(--text-secondary)]">SLA (min):</label>
          <input
            type="number"
            value={slaThreshold}
            onChange={e => setSlaThreshold(parseInt(e.target.value) || 60)}
            className="w-16 h-8 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] px-2 text-center"
          />
        </div>
      </div>

      {/* XLog Scatter Chart */}
      <Card>
        <EChartsWrapper option={chartOption} height={500} onInit={handleChartInit} />
      </Card>
    </div>
  );
}
