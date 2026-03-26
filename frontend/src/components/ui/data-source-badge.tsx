'use client';

import { cn } from '@/lib/utils';
import type { DataSource } from '@/hooks/use-data-source';

// ═══════════════════════════════════════════════════════════════
// DataSourceBadge — LIVE(녹색) / DEMO(노란색) 소형 배지
//
// 사용법:
//   <DataSourceBadge source="live" />
//   <DataSourceBadge source="demo" />
//   <DataSourceBadge source="demo" size="sm" />
// ═══════════════════════════════════════════════════════════════

interface DataSourceBadgeProps {
  source: DataSource;
  size?: 'xs' | 'sm';
  className?: string;
}

const CONFIG = {
  live: {
    dot: 'bg-[#3FB950]',
    bg: 'bg-[#3FB950]/10',
    text: 'text-[#3FB950]',
    label: 'LIVE',
  },
  demo: {
    dot: 'bg-[#D29922]',
    bg: 'bg-[#D29922]/10',
    text: 'text-[#D29922]',
    label: 'DEMO',
  },
};

export function DataSourceBadge({ source, size = 'xs', className }: DataSourceBadgeProps) {
  const c = CONFIG[source];
  const isXs = size === 'xs';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium select-none',
        c.bg, c.text,
        isXs ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]',
        className,
      )}
      title={source === 'live' ? 'Agent/Prometheus 연동 실데이터' : '샘플 데모 데이터 (연동 안 됨)'}
    >
      <span className={cn('rounded-full', c.dot, isXs ? 'w-1 h-1' : 'w-1.5 h-1.5')} />
      {c.label}
    </span>
  );
}
