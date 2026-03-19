'use client';

import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';
import type { Status } from '@/types/monitoring';

interface HealthCell {
  id: string;
  label: string;
  status: Status;
  detail?: string;
}

interface ServiceHealthGridProps {
  title: string;
  cells: HealthCell[];
  columns?: number;
  className?: string;
  onCellClick?: (id: string) => void;
}

const cellColor: Record<Status, string> = {
  healthy: 'bg-[var(--status-healthy)]',
  warning: 'bg-[var(--status-warning)]',
  critical: 'bg-[var(--status-critical)]',
  offline: 'bg-[var(--text-muted)]',
  unknown: 'bg-[var(--bg-tertiary)]',
};

export function ServiceHealthGrid({
  title,
  cells,
  columns = 6,
  className,
  onCellClick,
}: ServiceHealthGridProps) {
  return (
    <div className={cn('', className)}>
      <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">{title}</div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {cells.map((cell) => (
          <Tooltip
            key={cell.id}
            content={
              <div>
                <div className="font-medium">{cell.label}</div>
                {cell.detail && <div className="text-[var(--text-muted)]">{cell.detail}</div>}
              </div>
            }
          >
            <button
              className={cn(
                'aspect-square rounded-sm transition-all',
                'hover:ring-1 hover:ring-[var(--accent-primary)] hover:ring-offset-1',
                'hover:ring-offset-[var(--bg-secondary)]',
                'min-w-[20px] min-h-[20px]',
                cellColor[cell.status],
                cell.status === 'critical' && 'animate-pulse',
              )}
              onClick={() => onCellClick?.(cell.id)}
              aria-label={`${cell.label}: ${cell.status}`}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
