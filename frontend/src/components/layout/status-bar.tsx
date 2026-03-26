'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Wifi, Clock, RefreshCw, Database, Circle } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { getDataSourceCounts, subscribeDataSourceCounts } from '@/hooks/use-data-source';

export function StatusBar() {
  const mode = useUIStore((s) => s.dataSourceMode);
  const [counts, setCounts] = useState({ live: 0, demo: 0 });

  useEffect(() => {
    const update = () => setCounts(getDataSourceCounts());
    update();
    return subscribeDataSourceCounts(update);
  }, []);

  const modeLabel = mode === 'demo' ? 'Demo' : mode === 'live' ? 'Live' : 'Auto';
  const modeColor = mode === 'demo'
    ? 'text-[#D29922]'
    : mode === 'live'
      ? 'text-[#3FB950]'
      : 'text-[#58A6FF]';

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
        <span className={cn('inline-flex items-center gap-1', modeColor)}>
          <Database size={10} />
          {modeLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {(counts.live > 0 || counts.demo > 0) && (
          <span className="inline-flex items-center gap-2">
            {counts.live > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Circle size={6} fill="#3FB950" className="text-[#3FB950]" />
                {counts.live} Live
              </span>
            )}
            {counts.demo > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Circle size={6} fill="#D29922" className="text-[#D29922]" />
                {counts.demo} Demo
              </span>
            )}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <RefreshCw size={10} />
          Last updated: just now
        </span>
        <span>v1.0.0</span>
      </div>
    </footer>
  );
}
