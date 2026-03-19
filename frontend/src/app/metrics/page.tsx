'use client';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, SearchInput } from '@/components/ui';
import { BarChart3, Search } from 'lucide-react';

export default function MetricsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Metrics', icon: <BarChart3 size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Metrics Explorer</h1>
      </div>

      <Card padding="md">
        <SearchInput placeholder="Enter PromQL query..." className="w-full" />
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] text-sm">
          <div className="text-center space-y-3">
            <Search size={36} className="mx-auto opacity-30" />
            <p className="text-base">Select a metric to start exploring</p>
            <p className="text-xs">
              Try queries like <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">rate(http_requests_total[5m])</code> or{' '}
              <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">node_cpu_seconds_total</code>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
