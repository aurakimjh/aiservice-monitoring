'use client';

import { cn } from '@/lib/utils';
import type { Status, Severity } from '@/types/monitoring';

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

const dotSize = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-2.5 h-2.5' };
const textSize = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm' };

const statusColor: Record<Status, string> = {
  healthy: 'bg-[var(--status-healthy)]',
  warning: 'bg-[var(--status-warning)]',
  critical: 'bg-[var(--status-critical)]',
  offline: 'bg-[var(--text-muted)]',
  unknown: 'bg-[var(--text-muted)]',
};

const statusLabel: Record<Status, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
  unknown: 'Unknown',
};

export function StatusIndicator({ status, label, size = 'md', pulse }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', textSize[size])}>
      <span className="relative flex">
        <span className={cn('rounded-full', dotSize[size], statusColor[status])} />
        {pulse && status === 'critical' && (
          <span
            className={cn(
              'absolute rounded-full animate-ping opacity-50',
              dotSize[size],
              statusColor[status],
            )}
          />
        )}
      </span>
      <span className="text-[var(--text-secondary)]">{label ?? statusLabel[status]}</span>
    </span>
  );
}

interface SeverityIconProps {
  severity: Severity;
  className?: string;
}

const severityEmoji: Record<Severity, string> = {
  critical: '\u{1F534}',
  warning: '\u{1F7E1}',
  info: '\u{1F535}',
};

export function SeverityIcon({ severity, className }: SeverityIconProps) {
  return <span className={cn('text-xs', className)}>{severityEmoji[severity]}</span>;
}
