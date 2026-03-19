'use client';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, SearchInput, Select } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { Route } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_TRACES: {
  traceId: string; service: string; duration: number;
  spans: number; status: Status; timestamp: string;
}[] = [
  { traceId: 'abc123def456', service: 'api-gateway', duration: 245, spans: 8, status: 'healthy', timestamp: '2026-03-19 14:32:01' },
  { traceId: 'f7e8d9c0b1a2', service: 'payment-service', duration: 1820, spans: 14, status: 'critical', timestamp: '2026-03-19 14:31:45' },
  { traceId: '1a2b3c4d5e6f', service: 'user-service', duration: 89, spans: 4, status: 'healthy', timestamp: '2026-03-19 14:31:30' },
  { traceId: '9f8e7d6c5b4a', service: 'inventory-service', duration: 512, spans: 11, status: 'warning', timestamp: '2026-03-19 14:31:12' },
];

export default function TracesPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Traces', icon: <Route size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Trace Explorer</h1>
      </div>

      <Card padding="md">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            options={[
              { label: 'All Services', value: 'all' },
              { label: 'api-gateway', value: 'api-gateway' },
              { label: 'payment-service', value: 'payment-service' },
              { label: 'user-service', value: 'user-service' },
              { label: 'inventory-service', value: 'inventory-service' },
            ]}
            className="min-w-[160px]"
          />
          <Select
            options={[
              { label: 'All Statuses', value: 'all' },
              { label: 'Healthy', value: 'healthy' },
              { label: 'Warning', value: 'warning' },
              { label: 'Critical', value: 'critical' },
            ]}
            className="min-w-[140px]"
          />
          <SearchInput placeholder="Min duration (ms)..." className="max-w-[180px]" />
        </div>
      </Card>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium px-4 py-2.5">Trace ID</th>
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-right font-medium px-4 py-2.5">Duration</th>
                <th className="text-right font-medium px-4 py-2.5">Spans</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_TRACES.map((trace) => (
                <tr
                  key={trace.traceId}
                  className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--accent-primary)]">{trace.traceId}</td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">{trace.service}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{trace.duration} ms</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{trace.spans}</td>
                  <td className="px-4 py-2.5"><StatusIndicator status={trace.status} size="sm" /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">{trace.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
