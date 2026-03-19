'use client';

import { cn } from '@/lib/utils';
import type { GPUInfo } from '@/types/monitoring';

interface GPUCardProps {
  gpu: GPUInfo;
  hostname?: string;
  className?: string;
}

function GaugeBar({ value, max, label, unit, thresholds }: {
  value: number;
  max: number;
  label: string;
  unit: string;
  thresholds?: { warning: number; critical: number };
}) {
  const percent = (value / max) * 100;
  const warn = thresholds?.warning ?? 80;
  const crit = thresholds?.critical ?? 90;

  const barColor =
    percent >= crit
      ? 'var(--status-critical)'
      : percent >= warn
        ? 'var(--status-warning)'
        : 'var(--status-healthy)';

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text-secondary)] tabular-nums">
          {value.toFixed(0)}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export function GPUCard({ gpu, hostname, className }: GPUCardProps) {
  const vramStatus =
    gpu.vramPercent >= 90 ? 'critical' : gpu.vramPercent >= 80 ? 'warning' : 'healthy';

  const statusColor = {
    healthy: 'border-[var(--border-default)]',
    warning: 'border-[var(--status-warning)]',
    critical: 'border-[var(--status-critical)]',
  };

  return (
    <div
      className={cn(
        'bg-[var(--bg-secondary)] border rounded-[var(--radius-lg)] p-3 space-y-2',
        statusColor[vramStatus],
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-[var(--text-primary)]">
            GPU #{gpu.index}
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">{gpu.model}</div>
        </div>
        {hostname && (
          <div className="text-[10px] text-[var(--text-muted)]">{hostname}</div>
        )}
      </div>

      <GaugeBar
        value={gpu.vramPercent}
        max={100}
        label="VRAM"
        unit="%"
        thresholds={{ warning: 80, critical: 90 }}
      />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Temp</div>
          <div className={cn(
            'text-xs font-medium tabular-nums',
            gpu.temperature >= 85
              ? 'text-[var(--status-critical)]'
              : gpu.temperature >= 75
                ? 'text-[var(--status-warning)]'
                : 'text-[var(--text-primary)]',
          )}>
            {gpu.temperature}&deg;C
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Power</div>
          <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
            {gpu.powerDraw}W
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">SM</div>
          <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
            {gpu.smOccupancy}%
          </div>
        </div>
      </div>
    </div>
  );
}
