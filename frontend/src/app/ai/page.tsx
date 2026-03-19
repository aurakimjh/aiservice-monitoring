'use client';

import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui';
import { KPICard, StatusIndicator } from '@/components/monitoring';
import { Bot, Zap, Gauge, DollarSign, ShieldAlert } from 'lucide-react';
import type { Status } from '@/types/monitoring';

const DEMO_AI_SERVICES: {
  service: string; model: string; ttft: number; tps: number;
  costPerHour: number; gpu: number; status: Status;
}[] = [
  { service: 'llm-gateway', model: 'GPT-4o', ttft: 180, tps: 42, costPerHour: 12.50, gpu: 72, status: 'healthy' },
  { service: 'rag-pipeline', model: 'Claude 3.5', ttft: 220, tps: 38, costPerHour: 8.30, gpu: 65, status: 'warning' },
  { service: 'embedding-svc', model: 'text-embedding-3', ttft: 45, tps: 120, costPerHour: 2.10, gpu: 31, status: 'healthy' },
];

export default function AIPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', icon: <Bot size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Services</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          title="TTFT P95"
          value={220}
          unit="ms"
          trend={{ direction: 'down', value: '-12%', positive: true }}
          status="healthy"
        />
        <KPICard
          title="TPS P50"
          value={42}
          unit="tok/s"
          trend={{ direction: 'up', value: '+8%', positive: true }}
          status="healthy"
        />
        <KPICard
          title="GPU Avg"
          value={56}
          unit="%"
          trend={{ direction: 'up', value: '+5%', positive: false }}
          status="warning"
        />
        <KPICard
          title="Token Cost"
          value="$22.90"
          unit="/h"
          trend={{ direction: 'down', value: '-3%', positive: true }}
        />
        <KPICard
          title="Block Rate"
          value={0.8}
          unit="%"
          trend={{ direction: 'flat', value: '0%' }}
          status="healthy"
        />
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-left font-medium px-4 py-2.5">Model</th>
                <th className="text-right font-medium px-4 py-2.5">TTFT</th>
                <th className="text-right font-medium px-4 py-2.5">TPS</th>
                <th className="text-right font-medium px-4 py-2.5">Cost/h</th>
                <th className="text-right font-medium px-4 py-2.5">GPU</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_AI_SERVICES.map((svc) => (
                <tr
                  key={svc.service}
                  className="border-b border-[var(--border-muted)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-[var(--text-primary)]">{svc.service}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{svc.model}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.ttft} ms</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.tps} tok/s</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">${svc.costPerHour.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{svc.gpu}%</td>
                  <td className="px-4 py-2.5"><StatusIndicator status={svc.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
