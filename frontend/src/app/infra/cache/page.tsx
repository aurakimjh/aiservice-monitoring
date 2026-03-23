'use client';

import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getRedisMetrics } from '@/lib/demo-data';
import { Server, Database, Zap, MemoryStick, Activity } from 'lucide-react';

const ENGINE_COLORS: Record<string, string> = {
  redis: 'red',
  keydb: 'purple',
  valkey: 'blue',
};

const ROLE_VARIANT: Record<string, 'healthy' | 'warning' | 'info'> = {
  master: 'healthy',
  replica: 'info',
  standalone: 'warning',
};

function memoryBarColor(percent: number): string {
  if (percent >= 85) return 'var(--status-critical)';
  if (percent >= 70) return 'var(--status-warning)';
  return 'var(--status-healthy)';
}

function formatUptime(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  }
  return `${hours}h`;
}

export default function CachePage() {
  const instances = getRedisMetrics();

  const totalInstances = instances.length;
  const avgHitRate = +(instances.reduce((s, i) => s + i.hitRate, 0) / instances.length).toFixed(1);
  const avgMemory = +(instances.reduce((s, i) => s + i.memoryPercent, 0) / instances.length).toFixed(1);
  const totalOps = instances.reduce((s, i) => s + i.opsPerSec, 0);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: 'Cache', icon: <Database size={14} /> },
      ]} />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Redis / Cache Monitoring</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total Instances"
          value={totalInstances}
          status="healthy"
        />
        <KPICard
          title="Avg Hit Rate"
          value={avgHitRate}
          unit="%"
          status={avgHitRate >= 90 ? 'healthy' : avgHitRate >= 80 ? 'warning' : 'critical'}
        />
        <KPICard
          title="Avg Memory"
          value={avgMemory}
          unit="%"
          status={avgMemory >= 85 ? 'critical' : avgMemory >= 70 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Total Ops/sec"
          value={totalOps.toLocaleString()}
          status="healthy"
        />
      </div>

      {/* Instance Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {instances.map((inst) => {
          const barColor = memoryBarColor(inst.memoryPercent);
          return (
            <Card key={inst.id}>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="status"
                      className={cn(
                        'text-[10px] uppercase font-bold',
                        inst.engine === 'redis' && 'bg-red-500/15 text-red-400 border-red-500/30',
                        inst.engine === 'keydb' && 'bg-purple-500/15 text-purple-400 border-purple-500/30',
                        inst.engine === 'valkey' && 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                      )}
                    >
                      {inst.engine}
                    </Badge>
                    <CardTitle>{inst.name}</CardTitle>
                  </div>
                  <Badge variant="status" status={inst.status === 'healthy' ? 'healthy' : inst.status === 'warning' ? 'warning' : 'critical'}>
                    {inst.status}
                  </Badge>
                </div>
              </CardHeader>
              <div className="px-4 pb-4 space-y-3">
                {/* Host / Version / Role */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-mono">{inst.host}:{inst.port}</span>
                  <span>v{inst.version}</span>
                  <Badge
                    variant="status"
                    status={(ROLE_VARIANT[inst.role] ?? 'healthy') as 'healthy' | 'warning' | 'critical'}
                  >
                    {inst.role}
                  </Badge>
                </div>

                {/* Memory Gauge */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-muted)]">Memory</span>
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {inst.memoryUsedMB} / {inst.memoryMaxMB} MB ({inst.memoryPercent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${inst.memoryPercent}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Hit Rate</span>
                    <span className={cn(
                      'tabular-nums font-medium',
                      inst.hitRate >= 90 ? 'text-[var(--status-healthy)]' : 'text-[var(--status-warning)]'
                    )}>{inst.hitRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Evictions</span>
                    <span className={cn(
                      'tabular-nums',
                      inst.evictions > 0 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]'
                    )}>{inst.evictions.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Clients</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">{inst.connectedClients}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Ops/sec</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">{inst.opsPerSec.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Slowlog</span>
                    <span className={cn(
                      'tabular-nums',
                      inst.slowlogCount > 5 ? 'text-[var(--status-warning)] font-medium' : 'text-[var(--text-secondary)]'
                    )}>{inst.slowlogCount}</span>
                  </div>
                  {inst.replicationLag !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Repl Lag</span>
                      <span className="tabular-nums text-[var(--text-secondary)]">{inst.replicationLag}s</span>
                    </div>
                  )}
                </div>

                {/* Uptime */}
                <div className="pt-2 border-t border-[var(--border-muted)] flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>Uptime</span>
                  <span className="tabular-nums">{formatUptime(inst.uptimeHours)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
