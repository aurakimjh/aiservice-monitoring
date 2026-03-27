'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { SearchInput, Button, Select } from '@/components/ui';
import { StatusIndicator } from '@/components/monitoring';
import { useProjectStore } from '@/stores/project-store';
import { useUIStore } from '@/stores/ui-store';
import { getRelativeTime } from '@/lib/utils';
import { FolderOpen, Plus, Server, Network, Bot, Bell } from 'lucide-react';
import type { Environment, Status } from '@/types/monitoring';

const ENV_OPTIONS = [
  { label: 'All Environments', value: 'all' },
  { label: 'Production', value: 'production' },
  { label: 'Staging', value: 'staging' },
  { label: 'Development', value: 'development' },
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

const envColor: Record<Environment, string> = {
  production: 'text-[var(--status-healthy)]',
  staging: 'text-[var(--status-warning)]',
  development: 'text-[var(--status-info)]',
};

export default function ProjectsPage() {
  const router = useRouter();
  const dataSourceMode = useUIStore((s) => s.dataSourceMode);
  const storeProjects = useProjectStore((s) => s.projects);
  const projects = dataSourceMode === 'live' ? [] : storeProjects;
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (envFilter !== 'all' && p.environment !== envFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [projects, search, envFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Projects', icon: <FolderOpen size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Projects
          <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">({filtered.length})</span>
        </h1>
        <Button variant="primary" size="md" onClick={() => router.push('/projects/new')}>
          <Plus size={14} />
          New Project
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          placeholder="Search projects..."
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select options={ENV_OPTIONS} value={envFilter} onChange={(e) => setEnvFilter(e.target.value)} />
        <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--text-muted)]">
          No projects match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card hover padding="md" className="h-full">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusIndicator status={p.status} size="sm" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
                    </div>
                    <span className={`text-[10px] font-medium ${envColor[p.environment]}`}>{p.environment}</span>
                  </div>
                  {p.alertCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--status-critical)]">
                      <Bell size={10} /> {p.alertCount}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2">{p.description}</p>

                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-3">
                  <span className="flex items-center gap-1"><Server size={11} /> {p.hostCount}</span>
                  <span className="flex items-center gap-1"><Network size={11} /> {p.serviceCount}</span>
                  <span className="flex items-center gap-1"><Bot size={11} /> {p.aiServiceCount}</span>
                </div>

                <div className="flex items-center justify-between text-xs border-t border-[var(--border-muted)] pt-2">
                  <div className="space-x-3">
                    <span className="text-[var(--text-muted)]">Error: <span className="text-[var(--text-secondary)] tabular-nums">{p.errorRate}%</span></span>
                    <span className="text-[var(--text-muted)]">P95: <span className="text-[var(--text-secondary)] tabular-nums">{p.p95Latency}ms</span></span>
                  </div>
                  <span className="text-[var(--text-muted)]">{getRelativeTime(p.lastActivity)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
