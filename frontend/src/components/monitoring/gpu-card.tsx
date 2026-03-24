'use client';

import { cn } from '@/lib/utils';
import type { GPUInfo, GPUVendor } from '@/types/monitoring';

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

const VENDOR_STYLES: Record<GPUVendor, { label: string; color: string }> = {
  nvidia:  { label: 'NVIDIA',  color: '#76B900' },
  amd:     { label: 'AMD',     color: '#ED1C24' },
  intel:   { label: 'Intel',   color: '#0071C5' },
  apple:   { label: 'Apple',   color: '#A2AAAD' },
  virtual: { label: 'vGPU',    color: '#8B5CF6' },
  unknown: { label: 'GPU',     color: '#6B7280' },
};

function VendorBadge({ vendor }: { vendor?: GPUVendor }) {
  const v = vendor ?? 'unknown';
  const { label, color } = VENDOR_STYLES[v] ?? VENDOR_STYLES.unknown;
  return (
    <span
      className="text-[9px] font-semibold px-1 py-0.5 rounded"
      style={{ backgroundColor: color + '22', color }}
    >
      {label}
    </span>
  );
}

export function GPUCard({ gpu, hostname, className }: GPUCardProps) {
  const vramStatus =
    gpu.vramPercent >= 90 ? 'critical' : gpu.vramPercent >= 80 ? 'warning' : 'healthy';

  const statusColor = {
    healthy:  'border-[var(--border-default)]',
    warning:  'border-[var(--status-warning)]',
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
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-[var(--text-primary)]">
              GPU #{gpu.index}
            </span>
            <VendorBadge vendor={gpu.vendor} />
            {gpu.migEnabled && (
              <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                MIG
              </span>
            )}
            {gpu.isVirtual && !gpu.migEnabled && (
              <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-violet-500/20 text-violet-400">
                vGPU
              </span>
            )}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] truncate">{gpu.model}</div>
          {gpu.migInstance && (
            <div className="text-[9px] text-purple-400 truncate">{gpu.migInstance}</div>
          )}
        </div>
        {hostname && (
          <div className="text-[10px] text-[var(--text-muted)] shrink-0">{hostname}</div>
        )}
      </div>

      {gpu.vramTotal > 0 && (
        <GaugeBar
          value={gpu.vramPercent}
          max={100}
          label="VRAM"
          unit="%"
          thresholds={{ warning: 80, critical: 90 }}
        />
      )}

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
            {gpu.temperature > 0 ? `${gpu.temperature}°C` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Power</div>
          <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
            {gpu.powerDraw > 0 ? `${gpu.powerDraw}W` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {gpu.vendor === 'intel' || gpu.vendor === 'apple' ? 'Freq' : 'SM'}
          </div>
          <div className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
            {gpu.vendor === 'intel' || gpu.vendor === 'apple'
              ? (gpu.coreFreqMHz ? `${gpu.coreFreqMHz}MHz` : '—')
              : `${gpu.smOccupancy}%`}
          </div>
        </div>
      </div>

      {gpu.driverVersion && (
        <div className="text-[9px] text-[var(--text-muted)]">Driver {gpu.driverVersion}</div>
      )}
    </div>
  );
}
