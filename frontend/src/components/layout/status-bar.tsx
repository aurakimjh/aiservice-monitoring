'use client';

import { cn } from '@/lib/utils';
import { Wifi, Clock, RefreshCw } from 'lucide-react';

export function StatusBar() {
  return (
    <footer
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'h-[var(--statusbar-height)] px-4',
        'bg-[var(--bg-secondary)] border-t border-[var(--border-default)]',
        'flex items-center justify-between',
        'text-[10px] text-[var(--text-muted)]',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Wifi size={10} className="text-[var(--status-healthy)]" />
          Connected
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={10} />
          UTC+9 (KST)
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <RefreshCw size={10} />
          Last updated: just now
        </span>
        <span>v1.0.0</span>
      </div>
    </footer>
  );
}
