'use client';

import { cn } from '@/lib/utils';

interface EpochProgressProps {
  current: number;
  total: number;
  className?: string;
}

export function EpochProgress({ current, total, className }: EpochProgressProps) {
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const isCompleted = current >= total;

  return (
    <div className={cn('flex items-center gap-2 min-w-[140px]', className)}>
      <span className="text-xs tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
        Epoch {current}/{total}
      </span>
      <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isCompleted ? 'bg-[#58A6FF]' : 'bg-[#3FB950]',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
