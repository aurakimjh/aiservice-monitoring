'use client';

import { useState, useMemo } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { DagView } from '@/components/pipelines';
import { getPipelines } from '@/lib/demo-data';
import {
  Workflow,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  SkipForward,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ORCHESTRATOR_COLORS: Record<string, string> = {
  airflow: '#FF6F00',
  prefect: '#3B82F6',
  dagster: '#8B5CF6',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Loader2 size={12} className="animate-spin text-[#58A6FF]" />,
  success: <CheckCircle size={12} className="text-[#3FB950]" />,
  failed: <XCircle size={12} className="text-[#F85149]" />,
  queued: <Clock size={12} className="text-[#6E7681]" />,
  paused: <SkipForward size={12} className="text-[#D29922]" />,
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '--';
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(0)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function PipelinesPage() {
  const pipelines = useMemo(() => getPipelines(), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activePipelines = pipelines.length;
  const runningTasks = useMemo(
    () =>
      pipelines.reduce(
        (sum, p) => sum + p.tasks.filter((t) => t.status === 'running').length,
        0,
      ),
    [pipelines],
  );
  const avgSuccessRate = useMemo(
    () =>
      pipelines.length > 0
        ? pipelines.reduce((sum, p) => sum + p.successRate, 0) / pipelines.length
        : 0,
    [pipelines],
  );
  const avgDuration = useMemo(() => {
    const completed = pipelines.filter((p) => p.durationMs > 0);
    return completed.length > 0
      ? completed.reduce((sum, p) => sum + p.durationMs, 0) / completed.length
      : 0;
  }, [pipelines]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Pipelines', icon: <Workflow size={14} /> },
        ]}
      />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">
        Data Pipeline Monitoring
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Active Pipelines"
          value={activePipelines}
          status="healthy"
        />
        <KPICard
          title="Running Tasks"
          value={runningTasks}
          status={runningTasks > 0 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Success Rate"
          value={`${avgSuccessRate.toFixed(1)}%`}
          status={avgSuccessRate >= 95 ? 'healthy' : avgSuccessRate >= 85 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Avg Duration"
          value={formatDuration(avgDuration)}
        />
      </div>

      {/* Pipeline list table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left px-4 py-2.5 font-medium w-8" />
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Orchestrator</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Tasks</th>
                <th className="text-right px-4 py-2.5 font-medium">Duration</th>
                <th className="text-right px-4 py-2.5 font-medium">Last Run</th>
                <th className="text-right px-4 py-2.5 font-medium">Success Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {pipelines.map((p) => {
                const isExpanded = expandedId === p.id;
                return (
                  <tr
                    key={p.id}
                    className="group"
                  >
                    <td colSpan={8} className="p-0">
                      {/* Main row */}
                      <div
                        className="flex items-center hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <div className="px-4 py-2.5 w-8 shrink-0">
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-[var(--text-muted)]" />
                          ) : (
                            <ChevronRight size={14} className="text-[var(--text-muted)]" />
                          )}
                        </div>
                        <div className="px-4 py-2.5 flex-1 min-w-[160px]">
                          <span className="text-[var(--text-primary)] font-medium">
                            {p.name}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 min-w-[100px]">
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 text-white whitespace-nowrap capitalize"
                            style={{ backgroundColor: ORCHESTRATOR_COLORS[p.orchestrator] }}
                          >
                            {p.orchestrator}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 min-w-[100px]">
                          <span className="inline-flex items-center gap-1">
                            {STATUS_ICONS[p.status]}
                            <span
                              className={cn(
                                'capitalize',
                                p.status === 'success' && 'text-[#3FB950]',
                                p.status === 'running' && 'text-[#58A6FF]',
                                p.status === 'failed' && 'text-[#F85149]',
                                p.status === 'queued' && 'text-[#6E7681]',
                              )}
                            >
                              {p.status}
                            </span>
                          </span>
                        </div>
                        <div className="px-4 py-2.5 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--text-primary)] tabular-nums">
                              {p.completedTasks}/{p.totalTasks}
                            </span>
                            {/* Mini progress bar */}
                            <div className="w-16 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${p.totalTasks > 0 ? (p.completedTasks / p.totalTasks) * 100 : 0}%`,
                                  backgroundColor:
                                    p.status === 'failed'
                                      ? '#F85149'
                                      : p.status === 'success'
                                        ? '#3FB950'
                                        : '#58A6FF',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="px-4 py-2.5 text-right min-w-[80px] text-[var(--text-secondary)] tabular-nums">
                          {formatDuration(p.durationMs)}
                        </div>
                        <div className="px-4 py-2.5 text-right min-w-[80px] text-[var(--text-secondary)]">
                          {formatTimeAgo(p.lastRunAt)}
                        </div>
                        <div className="px-4 py-2.5 text-right min-w-[90px]">
                          <span
                            className={cn(
                              'tabular-nums font-medium',
                              p.successRate >= 95
                                ? 'text-[#3FB950]'
                                : p.successRate >= 85
                                  ? 'text-[#D29922]'
                                  : 'text-[#F85149]',
                            )}
                          >
                            {p.successRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Expanded DAG view */}
                      {isExpanded && (
                        <div className="border-t border-[var(--border-muted)] bg-[var(--bg-primary)] px-4">
                          <div className="py-2">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                              DAG View
                            </span>
                          </div>
                          <DagView tasks={p.tasks} />
                        </div>
                      )}
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
