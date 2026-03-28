'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, SearchInput, Select, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard, StatusIndicator } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getTenants } from '@/lib/demo-data';
import { formatCost, getRelativeTime } from '@/lib/utils';
import type { Tenant } from '@/types/monitoring';
import {
  Building2,
  Users,
  Server,
  FolderOpen,
  DollarSign,
  Palette,
  Shield,
  ChevronRight,
  X,
  ExternalLink,
  Clock,
  Mail,
} from 'lucide-react';

const PLAN_STYLES: Record<string, string> = {
  free: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
  pro: 'bg-[#58A6FF]/15 text-[#58A6FF]',
  enterprise: 'bg-[#D29922]/15 text-[#D29922]',
};

const STATUS_MAP: Record<string, { label: string; status: 'healthy' | 'warning' | 'critical' }> = {
  active: { label: 'Active', status: 'healthy' },
  trial: { label: 'Trial', status: 'warning' },
  suspended: { label: 'Suspended', status: 'critical' },
};

const PLAN_OPTIONS = [
  { label: 'All Plans', value: 'all' },
  { label: 'Enterprise', value: 'enterprise' },
  { label: 'Pro', value: 'pro' },
  { label: 'Free', value: 'free' },
];

export default function TenantsPage() {
  const demoFallback = useCallback(() => getTenants(), []);
  const { data: rawData, source } = useDataSource('/tenants', demoFallback, { refreshInterval: 30_000 });
  const tenants: Tenant[] = Array.isArray(rawData) ? rawData : (rawData as any)?.items ?? [];
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.slug.toLowerCase().includes(search.toLowerCase())) return false;
      if (planFilter !== 'all' && t.plan !== planFilter) return false;
      return true;
    });
  }, [tenants, search, planFilter]);

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'active').length;
    const totalRevenue = tenants.reduce((s, t) => s + t.monthlyUsage, 0);
    const totalUsers = tenants.reduce((s, t) => s + t.userCount, 0);
    const totalHosts = tenants.reduce((s, t) => s + t.hostCount, 0);
    return { total: tenants.length, active, totalRevenue, totalUsers, totalHosts };
  }, [tenants]);

  // Revenue by plan pie
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const revenuePie = useMemo<any>(() => {
    const byPlan: Record<string, number> = {};
    for (const t of tenants) { byPlan[t.plan] = (byPlan[t.plan] ?? 0) + t.monthlyUsage; }
    return {
      animation: false,
      series: [{
        type: 'pie', radius: ['50%', '75%'],
        data: Object.entries(byPlan).map(([plan, value]) => ({
          name: plan.charAt(0).toUpperCase() + plan.slice(1),
          value,
          itemStyle: { color: plan === 'enterprise' ? '#D29922' : plan === 'pro' ? '#58A6FF' : '#8B949E' },
        })),
        label: { show: true, formatter: '{b}\n${c}', fontSize: 10, color: '#8B949E' },
      }],
      tooltip: { trigger: 'item', formatter: '{b}: ${c}/mo ({d}%)' },
    };
  }, [tenants]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Tenants', icon: <Building2 size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Multi-Tenant Management</h1>
          <DataSourceBadge source={source} />
        </div>
        <Button variant="primary" size="md"><Building2 size={14} /> Add Tenant</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard helpId="tenant-total" title="Total Tenants" value={stats.total} subtitle={`${stats.active} active`} status="healthy" />
        <KPICard helpId="tenant-monthly-revenue" title="Monthly Revenue" value={formatCost(stats.totalRevenue)} subtitle="/month" status="healthy" />
        <KPICard helpId="tenant-total-users" title="Total Users" value={stats.totalUsers} status="healthy" />
        <KPICard helpId="tenant-total-hosts" title="Total Hosts" value={stats.totalHosts} status="healthy" />
        <KPICard helpId="tenant-avg-revenue" title="Avg Revenue" value={formatCost(stats.totalRevenue / stats.total)} unit="/tenant" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Tenant list (left 2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search tenants..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select options={PLAN_OPTIONS} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} />
          </div>

          {/* Tenant cards */}
          <div className="space-y-2">
            {filtered.map((tenant) => {
              const sm = STATUS_MAP[tenant.status];
              const usagePercent = tenant.monthlyLimit > 0 ? (tenant.monthlyUsage / tenant.monthlyLimit) * 100 : 0;
              return (
                <Card
                  key={tenant.id}
                  className={cn('cursor-pointer transition-colors', selectedTenantId === tenant.id ? 'border-[var(--accent-primary)]' : 'hover:border-[var(--border-emphasis)]')}
                  onClick={() => setSelectedTenantId(selectedTenantId === tenant.id ? null : tenant.id)}
                >
                  <div className="flex items-center gap-4">
                    {/* Logo/color */}
                    <div className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: tenant.primaryColor ?? '#8B949E' }}>
                      {tenant.name.charAt(0)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{tenant.name}</span>
                        <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', PLAN_STYLES[tenant.plan])}>
                          {tenant.plan.toUpperCase()}
                        </span>
                        <StatusIndicator status={sm.status} label={sm.label} size="sm" />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-muted)]">
                        <span>{tenant.slug}</span>
                        <span><FolderOpen size={9} className="inline" /> {tenant.projectCount} projects</span>
                        <span><Users size={9} className="inline" /> {tenant.userCount} users</span>
                        <span><Server size={9} className="inline" /> {tenant.hostCount} hosts</span>
                      </div>
                    </div>

                    {/* Usage */}
                    <div className="text-right shrink-0 w-32">
                      <div className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">{formatCost(tenant.monthlyUsage)}/mo</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', usagePercent > 90 ? 'bg-[var(--status-critical)]' : usagePercent > 70 ? 'bg-[var(--status-warning)]' : 'bg-[var(--accent-primary)]')} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{Math.round(usagePercent)}%</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">of {formatCost(tenant.monthlyLimit)} limit</div>
                    </div>

                    <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right panel: Revenue pie or tenant detail */}
        <div>
          {selectedTenant ? (
            <TenantDetail tenant={selectedTenant} onClose={() => setSelectedTenantId(null)} />
          ) : (
            <Card>
              <CardHeader><CardTitle helpId="chart-revenue-by-plan">Revenue by Plan</CardTitle></CardHeader>
              <EChartsWrapper option={revenuePie} height={220} />
              <div className="text-center mt-2 text-xs text-[var(--text-muted)]">
                Total: {formatCost(stats.totalRevenue)}/month
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tenant Detail Panel ──

function TenantDetail({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const sm = STATUS_MAP[tenant.status];
  const usagePercent = tenant.monthlyLimit > 0 ? (tenant.monthlyUsage / tenant.monthlyLimit) * 100 : 0;

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: tenant.primaryColor ?? '#8B949E' }}>
            {tenant.name.charAt(0)}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{tenant.name}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{tenant.slug}.aitop.io</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
          <X size={14} className="text-[var(--text-muted)]" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Status & Plan */}
        <div className="flex items-center gap-2">
          <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', PLAN_STYLES[tenant.plan])}>
            {tenant.plan.toUpperCase()}
          </span>
          <StatusIndicator status={sm.status} label={sm.label} size="sm" />
        </div>

        {/* Usage */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--text-secondary)]">Monthly Usage</span>
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">{formatCost(tenant.monthlyUsage)} / {formatCost(tenant.monthlyLimit)}</span>
          </div>
          <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', usagePercent > 90 ? 'bg-[var(--status-critical)]' : usagePercent > 70 ? 'bg-[var(--status-warning)]' : 'bg-[var(--accent-primary)]')} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Projects', value: tenant.projectCount, icon: <FolderOpen size={11} /> },
            { label: 'Users', value: tenant.userCount, icon: <Users size={11} /> },
            { label: 'Hosts', value: tenant.hostCount, icon: <Server size={11} /> },
            { label: 'Retention', value: `${tenant.dataRetentionDays}d`, icon: <Clock size={11} /> },
          ].map((item) => (
            <div key={item.label} className="px-2 py-1.5 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
              <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">{item.icon} {item.label}</div>
              <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>

        {/* White-label */}
        <div>
          <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">White-label</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Palette size={11} className="text-[var(--text-muted)]" />
              <span className="text-[var(--text-secondary)]">Brand Color:</span>
              <span className="w-4 h-4 rounded" style={{ backgroundColor: tenant.primaryColor ?? '#8B949E' }} />
              <span className="font-mono text-[var(--text-primary)]">{tenant.primaryColor ?? 'default'}</span>
            </div>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] mt-1">
            Portal: <span className="text-[var(--accent-primary)]">{tenant.slug}.aitop.io</span>
          </div>
        </div>

        {/* Contact */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Mail size={11} />
          <span className="text-[var(--text-secondary)]">{tenant.contactEmail}</span>
        </div>

        {/* Created */}
        <div className="text-[10px] text-[var(--text-muted)]">
          Created: {getRelativeTime(new Date(tenant.createdAt))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-muted)]">
          <Button variant="secondary" size="sm">Edit</Button>
          <Button variant="secondary" size="sm">View Portal</Button>
          {tenant.status === 'active' && <Button variant="secondary" size="sm" className="text-[var(--status-warning)]">Suspend</Button>}
          {tenant.status === 'suspended' && <Button variant="secondary" size="sm" className="text-[var(--status-healthy)]">Reactivate</Button>}
        </div>
      </div>
    </Card>
  );
}
