'use client';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { KPICard, StatusIndicator } from '@/components/monitoring';
import { Stethoscope } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_RUNS: {
  id: string; scope: string; items: number; passed: number;
  failed: number; status: Status; timestamp: string;
}[] = [
  { id: 'run-001', scope: 'Full Scan', items: 86, passed: 82, failed: 4, status: 'warning', timestamp: '2026-03-19 14:00' },
  { id: 'run-002', scope: 'AI Services', items: 31, passed: 31, failed: 0, status: 'healthy', timestamp: '2026-03-19 12:00' },
  { id: 'run-003', scope: 'Infrastructure', items: 55, passed: 50, failed: 5, status: 'critical', timestamp: '2026-03-19 08:00' },
  { id: 'run-004', scope: 'Full Scan', items: 86, passed: 84, failed: 2, status: 'warning', timestamp: '2026-03-18 14:00' },
];

export default function DiagnosticsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Diagnostics', icon: <Stethoscope size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">AITOP Diagnostics</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="IT Items" value={55} subtitle="hosts, services, middleware" />
        <KPICard title="AI Items" value={31} subtitle="models, pipelines, guardrails" />
        <KPICard title="Last Scan" value="14:00" subtitle="2026-03-19" status="healthy" />
        <KPICard title="Next Scheduled" value="20:00" subtitle="2026-03-19" />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium px-4 py-2.5">Run ID</th>
                <th className="text-left font-medium px-4 py-2.5">Scope</th>
                <th className="text-right font-medium px-4 py-2.5">Items</th>
                <th className="text-right font-medium px-4 py-2.5">Passed</th>
                <th className="text-right font-medium px-4 py-2.5">Failed</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_RUNS.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--accent-primary)]">{run.id}</td>
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">{run.scope}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{run.items}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--status-healthy)]">{run.passed}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--status-critical)]">{run.failed}</td>
                  <td className="px-4 py-2.5"><StatusIndicator status={run.status} size="sm" /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">{run.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
