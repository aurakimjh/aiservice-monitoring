'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, SearchInput, Select, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { getBatchJobs, getBatchExecutions } from '@/lib/demo-data';
import { getRelativeTime, formatDuration } from '@/lib/utils';
import type { EChartsOption } from 'echarts';
import {
  Timer,
  Play,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

const EChartsWrapper = dynamic(() => import('@/components/charts/echarts-wrapper').then(m => ({ default: m.EChartsWrapper })), { ssr: false });

const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  running:   { dot: '#58A6FF', bg: 'rgba(88,166,255,0.12)', text: '#58A6FF', label: 'Running' },
  completed: { dot: '#3FB950', bg: 'rgba(63,185,80,0.12)',  text: '#3FB950', label: 'Completed' },
  failed:    { dot: '#F85149', bg: 'rgba(248,81,73,0.12)',  text: '#F85149', label: 'Failed' },
  idle:      { dot: '#8B949E', bg: 'rgba(139,148,158,0.12)', text: '#8B949E', label: 'Idle' },
};

const LANG_OPTIONS = [
  { label: 'All Languages', value: '' },
  { label: 'Java', value: 'java' },
  { label: 'Python', value: 'python' },
  { label: 'Go', value: 'go' },
  { label: '.NET', value: 'dotnet' },
  { label: 'Shell', value: 'shell' },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Idle', value: 'idle' },
];

const LANG_BADGE: Record<string, { color: string; label: string }> = {
  java:   { color: '#ED8B00', label: 'Java' },
  python: { color: '#3776AB', label: 'Python' },
  go:     { color: '#00ADD8', label: 'Go' },
  dotnet: { color: '#512BD4', label: '.NET' },
  shell:  { color: '#4EAA25', label: 'Shell' },
};

export default function BatchPage() {
  const demoJobs = useCallback(() => getBatchJobs(), []);
  const demoExecs = useCallback(() => getBatchExecutions(), []);
  const { data: jobsData, source } = useDataSource('/batch/jobs', demoJobs, { refreshInterval: 30_000 });
  const { data: execsData } = useDataSource('/batch/executions', demoExecs, { refreshInterval: 30_000 });
  const jobs = Array.isArray(jobsData) ? jobsData : (jobsData as any)?.items ?? (jobsData as any)?.jobs ?? [];
  const recentExecs = (Array.isArray(execsData) ? execsData : (execsData as any)?.items ?? []).slice(0, 20);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const totalJobs = jobs.length;
  const runningNow = jobs.filter(j => j.status === 'running').length;
  const failedCount24h = jobs.reduce((s, j) => s + (j.failed_count_24h ?? 0), 0);
  const avgSuccessRate = jobs.length > 0
    ? Math.round(jobs.reduce((s, j) => s + (j.success_rate ?? 0), 0) / jobs.length * 10) / 10
    : 0;

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (search && !j.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (langFilter && j.language !== langFilter) return false;
      if (statusFilter && j.status !== statusFilter) return false;
      return true;
    });
  }, [jobs, search, langFilter, statusFilter]);

  const timelineOption = useMemo<EChartsOption>(() => {
    const stateColors: Record<string, string> = {
      COMPLETED: '#3FB950',
      FAILED: '#F85149',
      RUNNING: '#58A6FF',
      DETECTED: '#D29922',
    };

    const data = recentExecs.map((e, i) => ({
      value: [new Date(e.started_at).getTime(), i],
      itemStyle: { color: stateColors[e.state] || '#8B949E' },
      exec: e,
    }));

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { data: { exec: typeof recentExecs[0] } };
          const e = p.data.exec;
          return `<div style="font-size:12px">
            <strong>${e.job_name}</strong><br/>
            State: ${e.state}<br/>
            Duration: ${formatDuration(e.duration_ms ?? 0)}<br/>
            ${new Date(e.started_at).toLocaleString()}
          </div>`;
        },
      },
      xAxis: { type: 'time', name: 'Time' },
      yAxis: { show: false, type: 'value' },
      grid: { left: 48, right: 16, top: 8, bottom: 32 },
      series: [{
        type: 'scatter',
        symbolSize: 14,
        data,
      }],
    };
  }, [recentExecs]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Batch Monitoring', icon: <Timer size={14} /> },
        ]}
      />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Batch Monitoring</h1>
          <DataSourceBadge source={source} />
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Batch job execution tracking, performance analysis, and SLA management
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <KPICard
          helpId="total-batch-jobs"
          title="Total Jobs"
          value={totalJobs}
          subtitle="Registered batch jobs"
          sparkData={[5, 6, 6, 7, 7, 7, 7]}
        />
        <KPICard
          helpId="batch-running"
          title="Running Now"
          value={runningNow}
          status={runningNow > 0 ? 'healthy' : undefined}
          subtitle="Currently executing"
          sparkData={[1, 2, 1, 2, 3, 2, 2]}
        />
        <KPICard
          helpId="batch-failed-24h"
          title="Failed (24h)"
          value={failedCount24h}
          status={failedCount24h > 0 ? 'critical' : 'healthy'}
          subtitle="Last 24 hours"
          sparkData={[0, 1, 0, 0, 2, 1, failedCount24h]}
        />
        <KPICard
          helpId="batch-success-rate"
          title="Avg Success Rate"
          value={`${avgSuccessRate}%`}
          status={avgSuccessRate >= 95 ? 'healthy' : avgSuccessRate >= 80 ? 'warning' : 'critical'}
          subtitle="Across all jobs"
          sparkData={[92, 94, 95, 93, 96, 95, avgSuccessRate]}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="w-64"
        />
        <Select
          options={LANG_OPTIONS}
          value={langFilter}
          onChange={e => setLangFilter(e.target.value)}
          aria-label="Language filter"
        />
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          aria-label="Status filter"
        />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/batch/xlog"
            className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
          >
            XLog View <ChevronRight size={12} />
          </Link>
          <Link
            href="/batch/alerts"
            className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1"
          >
            Alert Rules <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Job Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Job Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Schedule</th>
                <th className="text-left px-4 py-2.5 font-medium">Language</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Last Execution</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg Duration</th>
                <th className="text-right px-4 py-2.5 font-medium">Success Rate</th>
                <th className="text-left px-4 py-2.5 font-medium">Next Run</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => {
                const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.idle;
                const langCfg = LANG_BADGE[job.language];
                return (
                  <tr
                    key={job.name}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/batch/${encodeURIComponent(job.name)}`}
                        className="text-[var(--accent-primary)] hover:underline font-medium"
                      >
                        {job.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[var(--text-primary)] text-xs">{job.schedule_human}</div>
                      <div className="text-[var(--text-muted)] text-[11px] font-mono">{job.schedule}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {langCfg && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: langCfg.color + '20', color: langCfg.color }}
                        >
                          {langCfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full mr-1.5"
                          style={{ backgroundColor: statusCfg.dot }}
                        />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                      {job.last_execution_at ? getRelativeTime(job.last_execution_at) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {formatDuration(job.avg_duration_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className="text-xs tabular-nums font-medium"
                        style={{
                          color: job.success_rate >= 95 ? '#3FB950'
                            : job.success_rate >= 80 ? '#D29922'
                            : '#F85149',
                        }}
                      >
                        {(job.success_rate ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                      {job.next_execution_at
                        ? new Date(job.next_execution_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '-'}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                    No batch jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Executions Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent Executions Timeline</h2>
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3FB950' }} />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F85149' }} />
              Failed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#58A6FF' }} />
              Running
            </span>
          </div>
        </div>
        <EChartsWrapper option={timelineOption} height={120} />
      </Card>
    </div>
  );
}
