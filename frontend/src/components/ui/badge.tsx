'use client';

import { cn } from '@/lib/utils';
import type { Status, Severity } from '@/types/monitoring';

type BadgeVariant = 'status' | 'severity' | 'tag' | 'count';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  status?: Status;
  severity?: Severity;
  className?: string;
}

const statusStyles: Record<Status, string> = {
  healthy: 'bg-[var(--status-healthy-bg)] text-[var(--status-healthy)] border-[var(--status-healthy)]',
  warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning)]',
  critical: 'bg-[var(--status-critical-bg)] text-[var(--status-critical)] border-[var(--status-critical)]',
  offline: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-default)]',
  unknown: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-default)]',
};

const severityStyles: Record<Severity, string> = {
  critical: 'bg-[var(--status-critical-bg)] text-[var(--status-critical)]',
  warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
  info: 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
};

export function Badge({ children, variant = 'tag', status, severity, className }: BadgeProps) {
  const base = 'inline-flex items-center gap-1 text-xs font-medium rounded-[var(--radius-full)] whitespace-nowrap';

  if (variant === 'status' && status) {
    return (
      <span className={cn(base, 'px-2 py-0.5 border', statusStyles[status], className)}>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
        />
        {children}
      </span>
    );
  }

  if (variant === 'severity' && severity) {
    return (
      <span className={cn(base, 'px-2 py-0.5', severityStyles[severity], className)}>
        {children}
      </span>
    );
  }

  if (variant === 'count') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
          'text-[10px] font-semibold rounded-[var(--radius-full)]',
          'bg-[var(--status-critical)] text-white',
          className,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        base,
        'px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-default)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: Status }) {
  const colorMap: Record<Status, string> = {
    healthy: 'var(--status-healthy)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
    offline: 'var(--text-muted)',
    unknown: 'var(--text-muted)',
  };
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: colorMap[status] }}
    />
  );
}
