'use client';

import { cn } from '@/lib/utils';
import { WidgetHelp } from './widget-help';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({ children, className, padding = 'md', hover, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-[var(--radius-lg)]',
        paddingStyles[padding],
        hover && 'hover:border-[var(--border-emphasis)] transition-colors cursor-pointer',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className, helpId }: { children: React.ReactNode; className?: string; helpId?: string }) {
  return (
    <h3 className={cn('text-sm font-medium text-[var(--text-primary)] inline-flex items-center gap-1', className)}>
      {children}
      {helpId && <WidgetHelp widgetId={helpId} />}
    </h3>
  );
}
