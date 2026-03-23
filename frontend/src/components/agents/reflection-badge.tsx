'use client';

import { cn } from '@/lib/utils';
import type { ReflectionLevel } from '@/types/monitoring';

interface ReflectionBadgeProps {
  level: ReflectionLevel;
  className?: string;
}

const levelConfig: Record<ReflectionLevel, { label: string; dotColor: string }> = {
  hot:     { label: 'Hot Reload',    dotColor: 'bg-[var(--status-healthy)]' },
  restart: { label: 'Agent Restart', dotColor: 'bg-[var(--status-warning)]' },
  app:     { label: 'App Restart',   dotColor: 'bg-[var(--status-critical)]' },
};

export function ReflectionBadge({ level, className }: ReflectionBadgeProps) {
  const { label, dotColor } = levelConfig[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)]',
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
      {label}
    </span>
  );
}
