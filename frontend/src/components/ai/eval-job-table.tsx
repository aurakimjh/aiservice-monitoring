'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { EvalJob, EvalJobStatus } from '@/types/monitoring';

interface EvalJobTableProps {
  jobs: EvalJob[];
  onJobClick: (jobId: string) => void;
  expandedJobId: string | null;
}

const statusBadge: Record<EvalJobStatus, { status: 'healthy' | 'warning' | 'critical' | 'offline'; label: string }> = {
  completed: { status: 'healthy', label: 'Completed' },
  running: { status: 'warning', label: 'Running' },
  pending: { status: 'offline', label: 'Pending' },
  failed: { status: 'critical', label: 'Failed' },
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '-';
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${seconds}s`;
}

function avgScore(job: EvalJob): number {
  if (job.aggregateScores.length === 0) return 0;
  return job.aggregateScores.reduce((s, m) => s + m.score, 0) / job.aggregateScores.length;
}

export function EvalJobTable({ jobs, onJobClick, expandedJobId }: EvalJobTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="text-left py-2 px-3 font-medium">Name</th>
            <th className="text-left py-2 px-3 font-medium">Model</th>
            <th className="text-left py-2 px-3 font-medium">Judge</th>
            <th className="text-left py-2 px-3 font-medium">Dataset</th>
            <th className="text-right py-2 px-3 font-medium">Samples</th>
            <th className="text-left py-2 px-3 font-medium min-w-[140px]">Avg Score</th>
            <th className="text-left py-2 px-3 font-medium">Status</th>
            <th className="text-right py-2 px-3 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const avg = avgScore(job);
            const isExpanded = expandedJobId === job.id;
            const badge = statusBadge[job.status];

            return (
              <tr
                key={job.id}
                className={cn(
                  'border-b border-[var(--border-default)] cursor-pointer transition-colors',
                  isExpanded
                    ? 'bg-[var(--bg-tertiary)]'
                    : 'hover:bg-[var(--bg-tertiary)]/50',
                )}
                onClick={() => onJobClick(job.id)}
              >
                <td className="py-2 px-3 text-[var(--text-primary)] font-medium">{job.name}</td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">{job.model}</td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">{job.judgeModel}</td>
                <td className="py-2 px-3 text-[var(--text-secondary)]">{job.datasetName}</td>
                <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                  {job.samplesProcessed}/{job.datasetSize}
                </td>
                <td className="py-2 px-3">
                  {job.aggregateScores.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            avg >= 0.8
                              ? 'bg-[var(--status-healthy)]'
                              : 'bg-[var(--status-warning)]',
                          )}
                          style={{ width: `${avg * 100}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'tabular-nums font-medium min-w-[32px] text-right',
                          avg >= 0.8
                            ? 'text-[var(--status-healthy)]'
                            : 'text-[var(--status-warning)]',
                        )}
                      >
                        {avg.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <Badge variant="status" status={badge.status}>{badge.label}</Badge>
                </td>
                <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                  {formatDuration(job.duration)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
