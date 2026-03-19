'use client';

import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, variant = 'underline', className }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-0.5 p-0.5',
          'bg-[var(--bg-tertiary)] rounded-[var(--radius-md)]',
          className,
        )}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)]',
                'transition-all',
                isActive
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'min-w-[16px] h-4 px-1 text-[10px] rounded-full flex items-center justify-center',
                    isActive
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                      : 'bg-[var(--bg-overlay)] text-[var(--text-muted)]',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Default: underline
  return (
    <div
      className={cn(
        'flex items-center gap-0 border-b border-[var(--border-muted)]',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-emphasis)]',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-[16px] h-4 px-1 text-[10px] rounded-full flex items-center justify-center',
                  isActive
                    ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
