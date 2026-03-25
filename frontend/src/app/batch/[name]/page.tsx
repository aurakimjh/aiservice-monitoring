'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { getBatchJobs, getBatchExecutions } from '@/lib/demo-data';
import { getRelativeTime, formatDuration, formatBytes } from '@/lib/utils';
import type { EChartsOption } from 'echarts';
import type { BatchExecution } from '@/types/monitoring';
import {
  Timer,
  Calendar,
  Server,
  Clock,
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

const EXEC_STATE_COLORS: Record<string, string> = {
  COMPLETED: '#3FB950',
  FAILED: '#F85149',
  RUNNING: '#58A6FF',
  DETECTED: '#D29922',
};

const LANG_BADGE: Record<string, { color: string; label: string }> = {
  java:   { color: '#ED8B00', label: 'Java' },
  python: { color: '#3776AB', label: 'Python' },
  go:     { color: '#00ADD8', label: 'Go' },
  dotnet: { color: '#512BD4', label: '.NET' },
  shell:  { color: '#4EAA25', label: 'Shell' },
};

type SortField = 'started_at' | 'duration_ms' | 'cpu_max' | 'memory_max';
type SortDir = 'asc' | 'desc';

export default function BatchJobDetailPage() {
  const params = useParams();
  const jobName = decodeURIComponent(params.name as string);

  const jobs = useMemo(() => getBatchJobs(), []);
  const job = useMemo(() => jobs.find(j => j.name === jobName), [jobs, jobName]);
  const executions = useMemo(() => getBatchExecutions(jobName), [jobName]);

  const [sortField, setSortField] = useState<SortField>('started_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...executions];
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case 'started_at': va = new Date(a.started_at).getTime(); vb = new Date(b.started_at).getTime(); break;
        case 'duration_ms': va = a.duration_ms; vb = b.duration_ms; break;
        case 'cpu_max': va = a.cpu_max; vb = b.cpu_max; break;
        case 'memory_max': va = a.memory_max; vb = b.memory_max; break;
        default: va = 0; vb = 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [executions, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  // 30-day execution history timeline
  const timelineOption = useMemo<EChartsOption>(() => {
    const data = executions.map(e => {
      const startMs = new Date(e.started_at).getTime();
      const durationMin = e.duration_ms / 60_000;
      const isSlow = e.state === 'COMPLETED' && durationMin > (job?.avg_duration_ms ?? 0) / 60_000 * 1.5;
      const color = e.state === 'FAILED' ? '#F85149' : isSlow ? '#D29922' : '#3FB950';
      return {
        value: [startMs, durationMin],
        itemStyle: { color },
      };
    });

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { data: { value: [number, number] } };
          const [ts, dur] = p.data.value;
          return `${new Date(ts).toLocaleString()}<br/>Duration: ${dur.toFixed(1)} min`;
        },
      },
      xAxis: {
        type: 'time',
        name: 'Date',
        nameTextStyle: { color: '#8B949E', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'Duration (min)',
        nameTextStyle: { color: '#8B949E', fontSize: 10, padding: [0, 0, 0, -30] },
      },
      grid: { left: 56, right: 16, top: 16, bottom: 36 },
      series: [{
        type: 'bar',
        data,
        barMaxWidth: 12,
      }],
    };
  }, [executions, job]);

  if (!job) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[
          { label: 'Home', href: '/' },
          { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
          { label: jobName },
        ]} />
        <Card>
          <div className="py-12 text-center text-[var(--text-muted)]">
            Job &quot;{jobName}&quot; not found
          </div>
        </Card>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.idle;
  const langCfg = LANG_BADGE[job.language];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
        { label: jobName },
      ]} />

      {/* Job Info Card */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">{job.name}</h1>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: statusCfg.dot }} />
                {statusCfg.label}
              </span>
              {langCfg && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: langCfg.color + '20', color: langCfg.color }}
                >
                  {langCfg.label}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Scheduler: {job.scheduler} | Host: {job.hostname}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4 mt-4 pt-4 border-t border-[var(--border-muted)]">
          <div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><Calendar size={11} /> Schedule</div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{job.schedule_human}</div>
            <div className="text-[11px] font-mono text-[var(--text-secondary)]">{job.schedule}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><Clock size={11} /> Avg Duration</div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{formatDuration(job.avg_duration_ms)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><TrendingUp size={11} /> Success Rate</div>
            <div className="text-sm font-medium mt-0.5" style={{
              color: job.success_rate >= 95 ? '#3FB950' : job.success_rate >= 80 ? '#D29922' : '#F85149',
            }}>
              {job.success_rate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Total Executions</div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{job.total_executions}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)]">Failed (24h)</div>
            <div className="text-sm font-medium mt-0.5" style={{
              color: job.failed_count_24h > 0 ? '#F85149' : '#3FB950',
            }}>
              {job.failed_count_24h}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><Server size={11} /> Host</div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{job.hostname}</div>
          </div>
        </div>
      </Card>

      {/* Execution History Timeline */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Execution History</h2>
          <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3FB950' }} />
              Success
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F85149' }} />
              Failed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D29922' }} />
              Slow
            </span>
          </div>
        </div>
        <EChartsWrapper option={timelineOption} height={200} />
      </Card>

      {/* Execution List Table */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-[var(--border-default)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Executions ({executions.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2.5 font-medium">Execution ID</th>
                <th
                  className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]"
                  onClick={() => handleSort('started_at')}
                >
                  Started{sortIndicator('started_at')}
                </th>
                <th
                  className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]"
                  onClick={() => handleSort('duration_ms')}
                >
                  Duration{sortIndicator('duration_ms')}
                </th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Exit Code</th>
                <th
                  className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]"
                  onClick={() => handleSort('cpu_max')}
                >
                  CPU (avg/max){sortIndicator('cpu_max')}
                </th>
                <th
                  className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-[var(--text-primary)]"
                  onClick={() => handleSort('memory_max')}
                >
                  Memory Max{sortIndicator('memory_max')}
                </th>
                <th className="text-right px-4 py-2.5 font-medium">I/O Total</th>
                <th className="text-center px-4 py-2.5 font-medium w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(exec => {
                const stateColor = EXEC_STATE_COLORS[exec.state] || '#8B949E';
                return (
                  <tr
                    key={exec.execution_id}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/batch/executions/${exec.execution_id}`}
                        className="text-[var(--accent-primary)] hover:underline font-mono text-xs"
                      >
                        {exec.execution_id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                      {new Date(exec.started_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {formatDuration(exec.duration_ms)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ backgroundColor: stateColor + '18', color: stateColor }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: stateColor }} />
                        {exec.state}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums" style={{
                      color: exec.exit_code === 0 ? 'var(--text-secondary)' : '#F85149',
                    }}>
                      {exec.exit_code}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {exec.cpu_avg.toFixed(1)}% / {exec.cpu_max.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatBytes(exec.memory_max)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                      {formatBytes(exec.io_read_total + exec.io_write_total)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Link
                        href={`/batch/executions/${exec.execution_id}`}
                        className="text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
