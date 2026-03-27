'use client';

import { cn } from '@/lib/utils';
import { SparkLine } from '@/components/charts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type TrendDirection = 'up' | 'down' | 'flat';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: { direction: TrendDirection; value: string; positive?: boolean };
  sparkData?: number[];
  status?: 'healthy' | 'warning' | 'critical';
  badge?: React.ReactNode;
  className?: string;
}

const statusBorderColor = {
  healthy: 'border-l-[var(--status-healthy)]',
  warning: 'border-l-[var(--status-warning)]',
  critical: 'border-l-[var(--status-critical)]',
};

export function KPICard({
  title,
  value,
  unit,
  subtitle,
  trend,
  sparkData,
  status,
  badge,
  className,
}: KPICardProps) {
  const TrendIcon =
    trend?.direction === 'up'
      ? TrendingUp
      : trend?.direction === 'down'
        ? TrendingDown
        : Minus;

  const trendColor =
    trend?.positive === true
      ? 'text-[var(--status-healthy)]'
      : trend?.positive === false
        ? 'text-[var(--status-critical)]'
        : 'text-[var(--text-muted)]';

  return (
    <div
      className={cn(
        'bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-[var(--radius-lg)]',
        'p-4 flex flex-col gap-2',
        status && `border-l-2 ${statusBorderColor[status]}`,
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium">
        {title}
        {badge}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-[var(--text-muted)]">{unit}</span>
          )}
        </div>

        {sparkData && sparkData.length > 1 && (
          <SparkLine
            data={sparkData}
            width={64}
            height={24}
            color={
              status === 'critical'
                ? '#F85149'
                : status === 'warning'
                  ? '#D29922'
                  : '#58A6FF'
            }
          />
        )}
      </div>

      {(trend || subtitle) && (
        <div className="flex items-center gap-2 text-xs">
          {trend && (
            <span className={cn('inline-flex items-center gap-0.5', trendColor)}>
              <TrendIcon size={12} />
              {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-[var(--text-muted)]">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
