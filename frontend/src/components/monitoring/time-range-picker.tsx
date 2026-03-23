'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TimeRangeArrows, type TimeRange } from './time-range-arrows';

const PRESETS = [
  { label: '5분', ms: 5 * 60_000 },
  { label: '15분', ms: 15 * 60_000 },
  { label: '1시간', ms: 60 * 60_000 },
  { label: '6시간', ms: 6 * 60 * 60_000 },
  { label: '1일', ms: 24 * 60 * 60_000 },
];

function toDatetimeLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface TimeRangePickerProps {
  range: TimeRange;
  isLive?: boolean;
  onRangeChange: (range: TimeRange) => void;
  onToggleLive?: () => void;
  className?: string;
}

export function TimeRangePicker({
  range,
  isLive = false,
  onRangeChange,
  onToggleLive,
  className,
}: TimeRangePickerProps) {
  const currentWidth = range.to - range.from;
  const [activePreset, setActivePreset] = useState<number>(
    PRESETS.find((p) => Math.abs(p.ms - currentWidth) < 60_000)?.ms ?? 15 * 60_000,
  );
  const [fromVal, setFromVal] = useState(() => toDatetimeLocal(range.from));
  const [toVal, setToVal] = useState(() => toDatetimeLocal(range.to));

  const applyPreset = (ms: number) => {
    const to = Date.now();
    const r: TimeRange = { from: to - ms, to };
    setActivePreset(ms);
    onRangeChange(r);
    setFromVal(toDatetimeLocal(r.from));
    setToVal(toDatetimeLocal(r.to));
  };

  const applyCustom = () => {
    const f = new Date(fromVal).getTime();
    const t = new Date(toVal).getTime();
    if (!isNaN(f) && !isNaN(t) && f < t) {
      setActivePreset(-1);
      onRangeChange({ from: f, to: t });
    }
  };

  const handleArrowChange = (r: TimeRange) => {
    setActivePreset(-1);
    onRangeChange(r);
    setFromVal(toDatetimeLocal(r.from));
    setToVal(toDatetimeLocal(r.to));
  };

  const inputCls =
    'text-[11px] bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[var(--text-primary)]';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Preset + custom date row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-[var(--text-muted)] shrink-0">기간:</span>
        {PRESETS.map((p) => (
          <button
            key={p.ms}
            onClick={() => applyPreset(p.ms)}
            className={cn(
              'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
              activePreset === p.ms
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]',
            )}
          >
            {p.label}
          </button>
        ))}
        <span className="text-[10px] text-[var(--text-muted)] ml-1 shrink-0">커스텀:</span>
        <input
          type="datetime-local"
          value={fromVal}
          onChange={(e) => setFromVal(e.target.value)}
          className={inputCls}
        />
        <span className="text-[var(--text-muted)] text-[11px]">~</span>
        <input
          type="datetime-local"
          value={toVal}
          onChange={(e) => setToVal(e.target.value)}
          className={inputCls}
        />
        <button
          onClick={applyCustom}
          className="px-2 py-0.5 text-[11px] font-medium rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] border border-[var(--border-default)] transition-colors"
        >
          적용
        </button>
      </div>

      {/* Arrow nav row */}
      <TimeRangeArrows
        range={range}
        isLive={isLive}
        onRangeChange={handleArrowChange}
        onToggleLive={onToggleLive}
      />
    </div>
  );
}
