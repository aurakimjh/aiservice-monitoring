'use client';

import { cn } from '@/lib/utils';

interface DagViewProps {
  tasks: { id: string; name: string; status: string; durationMs: number }[];
}

const statusColors: Record<string, string> = {
  success: '#3FB950',
  running: '#58A6FF',
  failed: '#F85149',
  pending: '#6E7681',
  skipped: '#D29922',
};

function formatDuration(ms: number): string {
  if (ms <= 0) return '--';
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function DagView({ tasks }: DagViewProps) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-3 px-2">
      {tasks.map((task, index) => {
        const color = statusColors[task.status] ?? '#6E7681';
        const isRunning = task.status === 'running';

        return (
          <div key={task.id} className="flex items-center shrink-0">
            {/* Arrow connector */}
            {index > 0 && (
              <div className="flex items-center shrink-0 mx-1">
                <div className="w-6 h-px bg-[var(--border-emphasis)]" />
                <div
                  className="w-0 h-0 shrink-0"
                  style={{
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderLeft: '6px solid var(--border-emphasis)',
                  }}
                />
              </div>
            )}

            {/* Task node */}
            <div
              className={cn(
                'relative flex flex-col items-center justify-center',
                'min-w-[120px] px-3 py-2 rounded-lg border',
                isRunning && 'animate-pulse',
              )}
              style={{
                backgroundColor: `${color}15`,
                borderColor: `${color}60`,
              }}
            >
              {/* Status icon */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="text-xs font-medium truncate max-w-[100px]"
                  style={{ color }}
                >
                  {task.name}
                </span>
              </div>

              {/* Duration */}
              <span className="text-[10px] text-[var(--text-muted)]">
                {formatDuration(task.durationMs)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
