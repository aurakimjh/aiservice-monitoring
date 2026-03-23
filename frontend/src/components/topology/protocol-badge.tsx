'use client';

import { cn } from '@/lib/utils';

export interface ProtocolBadgeProps {
  protocol: 'http' | 'grpc' | 'sql' | 'redis' | 'kafka' | 'unknown';
}

const PROTOCOL_COLORS: Record<ProtocolBadgeProps['protocol'], string> = {
  http: '#58A6FF',
  grpc: '#BC8CFF',
  sql: '#D29922',
  redis: '#F85149',
  kafka: '#3FB950',
  unknown: '#888888',
};

const PROTOCOL_LABELS: Record<ProtocolBadgeProps['protocol'], string> = {
  http: 'HTTP',
  grpc: 'gRPC',
  sql: 'SQL',
  redis: 'Redis',
  kafka: 'Kafka',
  unknown: 'Unknown',
};

export function ProtocolBadge({ protocol }: ProtocolBadgeProps) {
  const color = PROTOCOL_COLORS[protocol];
  const label = PROTOCOL_LABELS[protocol];

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none',
      )}
      style={{
        color,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  );
}
