'use client';

import { Card } from '@/components/ui';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { SearchInput, Button } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { FolderOpen, Plus, Server, Network, Bot, Bell } from 'lucide-react';
import type { Status, Environment } from '@/types/monitoring';

const DEMO_PROJECTS: {
  id: string; name: string; env: Environment; status: Status;
  hosts: number; services: number; aiServices: number; alerts: number;
  errorRate: number; p95: number; lastActivity: string;
}[] = [
  { id: '1', name: 'AI-Production', env: 'production', status: 'healthy', hosts: 12, services: 8, aiServices: 3, alerts: 1, errorRate: 0.12, p95: 245, lastActivity: '2m ago' },
  { id: '2', name: 'E-Commerce-Staging', env: 'staging', status: 'warning', hosts: 6, services: 5, aiServices: 0, alerts: 2, errorRate: 0.85, p95: 380, lastActivity: '15m ago' },
  { id: '3', name: 'Banking-Core', env: 'production', status: 'healthy', hosts: 20, services: 15, aiServices: 1, alerts: 0, errorRate: 0.05, p95: 120, lastActivity: '30s ago' },
  { id: '4', name: 'ML-Training', env: 'development', status: 'critical', hosts: 4, services: 2, aiServices: 2, alerts: 3, errorRate: 2.1, p95: 1200, lastActivity: '5m ago' },
];

const envColor: Record<Environment, string> = {
  production: 'text-[var(--status-healthy)]',
  staging: 'text-[var(--status-warning)]',
  development: 'text-[var(--status-info)]',
};

export default function ProjectsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Projects', icon: <FolderOpen size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Projects</h1>
        <Button variant="primary" size="md">
          <Plus size={14} />
          New Project
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <SearchInput placeholder="Search projects..." className="max-w-xs" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {DEMO_PROJECTS.map((p) => (
          <Card key={p.id} hover padding="md">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={p.status} size="sm" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
                </div>
                <span className={`text-[10px] ${envColor[p.env]}`}>{p.env}</span>
              </div>
              {p.alerts > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--status-critical)]">
                  <Bell size={10} /> {p.alerts}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-3">
              <span className="flex items-center gap-1"><Server size={11} /> {p.hosts}</span>
              <span className="flex items-center gap-1"><Network size={11} /> {p.services}</span>
              <span className="flex items-center gap-1"><Bot size={11} /> {p.aiServices}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="space-x-3">
                <span className="text-[var(--text-muted)]">Error: <span className="text-[var(--text-secondary)] tabular-nums">{p.errorRate}%</span></span>
                <span className="text-[var(--text-muted)]">P95: <span className="text-[var(--text-secondary)] tabular-nums">{p.p95}ms</span></span>
              </div>
              <span className="text-[var(--text-muted)]">{p.lastActivity}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
