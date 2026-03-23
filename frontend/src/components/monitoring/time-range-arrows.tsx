'use client';

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimeRange {
  from: number; // epoch ms
  to: number;   // epoch ms
}

interface TimeRangeArrowsProps {
  range: TimeRange;
  isLive?: boolean;
  onRangeChange: (range: TimeRange) => void;
  onToggleLive?: () => void;
  className?: string;
}

function formatRangeLabel(from: number, to: number): string {
  const diffMs = to - from;
  const diffMin = Math.round(diffMs / 60_000);
  const diffH = Math.round(diffMs / 3_600_000);
  const duration =
    diffMin < 60
      ? `${diffMin}분`
      : diffH < 24
        ? `${diffH}시간`
        : `${Math.round(diffH / 24)}일`;
  const p = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${fmt(new Date(from))} ~ ${fmt(new Date(to))} (${duration})`;
}

export function TimeRangeArrows({
  range,
  isLive = false,
  onRangeChange,
  onToggleLive,
  className,
}: TimeRangeArrowsProps) {
  const width = range.to - range.from;

  const shiftBack = () =>
    onRangeChange({ from: range.from - width, to: range.to - width });

  const shiftForward = () => {
    const now = Date.now();
    const newTo = Math.min(range.to + width, now);
    onRangeChange({ from: newTo - width, to: newTo });
  };

  const zoomIn = () => {
    const center = (range.from + range.to) / 2;
    onRangeChange({ from: center - width / 4, to: center + width / 4 });
  };

  const zoomOut = () => {
    const center = (range.from + range.to) / 2;
    onRangeChange({ from: center - width, to: center + width });
  };

  // Alt+Arrow keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); shiftBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); shiftForward(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); zoomIn(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); zoomOut(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const atNow = range.to >= Date.now() - 5_000;
  const btn = (onClick: () => void, title: string, disabled = false, children: React.ReactNode) => (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'p-1 rounded hover:bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );

  return (
    <div className={cn('flex items-center gap-1 text-xs', className)}>
      {btn(shiftBack, '과거 이동 (Alt+←)', false, <ChevronLeft size={14} />)}
      {btn(shiftForward, '미래 이동 (Alt+→)', atNow, <ChevronRight size={14} />)}

      {onToggleLive && (
        <button
          onClick={onToggleLive}
          title="실시간 모드 토글"
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors select-none',
            isLive
              ? 'bg-[var(--status-critical)]/15 text-[var(--status-critical)] hover:bg-[var(--status-critical)]/25'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-overlay)]',
          )}
        >
          <Circle size={5} fill="currentColor" />
          {isLive ? 'LIVE' : 'PAUSED'}
        </button>
      )}

      <span className="px-1.5 tabular-nums text-[11px] text-[var(--text-muted)] select-none">
        {formatRangeLabel(range.from, range.to)}
      </span>

      {btn(zoomIn, '줌 인 (Alt+↑)', false, <ChevronUp size={14} />)}
      {btn(zoomOut, '줌 아웃 (Alt+↓)', false, <ChevronDown size={14} />)}
    </div>
  );
}
