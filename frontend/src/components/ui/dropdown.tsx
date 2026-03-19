'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number | string;
  className?: string;
}

export function Dropdown({ trigger, children, align = 'left', width = 240, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)} className="cursor-pointer">
        {trigger}
      </div>

      {open && (
        <div
          className={cn(
            'absolute top-full mt-1 z-50',
            'bg-[var(--bg-overlay)] border border-[var(--border-default)]',
            'rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]',
            'overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          style={{ width: typeof width === 'number' ? `${width}px` : width }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  icon?: ReactNode;
  children: ReactNode;
  description?: string;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
}

export function DropdownItem({ icon, children, description, onClick, danger, active, className }: DropdownItemProps) {
  return (
    <button
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm',
        'transition-colors',
        active
          ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
          : danger
            ? 'text-[var(--status-critical)] hover:bg-[var(--status-critical-bg)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
        className,
      )}
      onClick={onClick}
    >
      {icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="truncate">{children}</div>
        {description && <div className="text-[10px] text-[var(--text-muted)] truncate">{description}</div>}
      </div>
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 border-t border-[var(--border-muted)]" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
      {children}
    </div>
  );
}
