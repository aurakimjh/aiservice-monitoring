'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, X, Bell } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Severity } from '@/types/monitoring';

interface AlertBannerProps {
  severity: Severity;
  title: string;
  message: string;
  timestamp?: string;
  onDismiss?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

const severityStyles: Record<Severity, string> = {
  critical: 'bg-[var(--status-critical-bg)] border-[var(--status-critical)]',
  warning: 'bg-[var(--status-warning-bg)] border-[var(--status-warning)]',
  info: 'bg-[var(--status-info-bg)] border-[var(--status-info)]',
};

const severityIcon: Record<Severity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Bell,
};

const severityTextColor: Record<Severity, string> = {
  critical: 'text-[var(--status-critical)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};

export function AlertBanner({
  severity,
  title,
  message,
  timestamp,
  onDismiss,
  onViewDetails,
  className,
}: AlertBannerProps) {
  const Icon = severityIcon[severity];

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 border rounded-[var(--radius-md)]',
        severityStyles[severity],
        className,
      )}
      role="alert"
    >
      <Icon size={16} className={severityTextColor[severity]} />

      <div className="flex-1 min-w-0">
        <span className={cn('text-xs font-semibold mr-2', severityTextColor[severity])}>
          {title}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">{message}</span>
        {timestamp && (
          <span className="text-[10px] text-[var(--text-muted)] ml-2">{timestamp}</span>
        )}
      </div>

      {onViewDetails && (
        <Button variant="ghost" size="sm" onClick={onViewDetails}>
          View
        </Button>
      )}

      {onDismiss && (
        <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
