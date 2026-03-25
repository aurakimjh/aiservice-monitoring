'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getRedisMetrics, getRedisClusterMetrics, getCacheAlertRules, getCacheAlertEvents } from '@/lib/demo-data';
import { Server, Database, Zap, Network, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { RedisClusterMetrics, CacheAlertRule, CacheAlertEvent } from '@/types/monitoring';

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

// ── Redis Cluster View (26-5-6) ───────────────────────────────────────────────
function ClusterCard({ cluster }: { cluster: RedisClusterMetrics }) {
  const healthyPct = cluster.slotsAssigned > 0
    ? Math.round((cluster.slotsOK / cluster.slotsAssigned) * 100)
    : 0;
  const statusColor = cluster.clusterState === 'ok' ? 'var(--status-healthy)' : 'var(--status-critical)';

  return (
    <Card className={cluster.clusterState !== 'ok' ? 'border-red-500/40' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Network size={13} className="text-[var(--text-muted)]" />
            <CardTitle>{cluster.host}:{cluster.port}</CardTitle>
          </div>
          <Badge variant="status" status={cluster.clusterState === 'ok' ? 'healthy' : 'critical'}>
            {cluster.clusterState}
          </Badge>
        </div>
      </CardHeader>
      <div className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-center">
            <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{cluster.clusterSize}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Nodes</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-center">
            <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{cluster.knownNodes}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Known</div>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-center">
            <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{cluster.connectedSlaves}</div>
            <div className="text-[10px] text-[var(--text-muted)]">Slaves</div>
          </div>
        </div>
        {/* Slot distribution */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--text-muted)]">Slot Health</span>
            <span className="tabular-nums font-medium" style={{ color: statusColor }}>{healthyPct}%</span>
          </div>
          <EChartsWrapper
            height={32}
            option={{
              grid: { top: 0, bottom: 0, left: 0, right: 0 },
              xAxis: { type: 'value', show: false, max: cluster.slotsAssigned },
              yAxis: { type: 'category', show: false },
              series: [
                { type: 'bar', stack: 'slots', data: [cluster.slotsOK], itemStyle: { color: 'var(--status-healthy)' }, barWidth: 12 },
                { type: 'bar', stack: 'slots', data: [cluster.slotsPfail], itemStyle: { color: 'var(--status-warning)' }, barWidth: 12 },
                { type: 'bar', stack: 'slots', data: [cluster.slotsFail], itemStyle: { color: 'var(--status-critical)' }, barWidth: 12 },
              ],
            }}
          />
          <div className="flex gap-3 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--status-healthy)] inline-block" />{cluster.slotsOK} ok</span>
            {cluster.slotsPfail > 0 && <span className="flex items-center gap-1 text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />{cluster.slotsPfail} pfail</span>}
            {cluster.slotsFail > 0 && <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{cluster.slotsFail} fail</span>}
          </div>
        </div>
        {cluster.migrationStatus && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
            <AlertTriangle size={11} />
            <span>Slot migration in progress</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Alert Rules Panel (26-5-7) ────────────────────────────────────────────────
function AlertRulesPanel({ rules, events }: { rules: CacheAlertRule[]; events: CacheAlertEvent[] }) {
  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--status-warning)]" />
              <CardTitle>Active Alerts</CardTitle>
              <Badge variant="status" status="warning">{events.length}</Badge>
            </div>
          </CardHeader>
          <div className="px-4 pb-4 space-y-2">
            {events.map((e) => (
              <div key={e.alertId} className={cn(
                'p-2 rounded-lg text-xs',
                e.severity === 'critical' ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400',
              )}>
                <span className="font-medium">[{e.severity}]</span> {e.message}
                <span className="ml-2 text-[var(--text-muted)]">→ {e.actions.join(', ')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-[var(--text-muted)]" />
            <CardTitle>Alert Rules</CardTitle>
            <Badge variant="status">{rules.length} rules</Badge>
          </div>
        </CardHeader>
        <div className="px-4 pb-4 space-y-2">
          {rules.map((r) => (
            <div key={r.name} className={cn(
              'flex items-start gap-2 p-2 rounded-lg text-xs',
              r.severity === 'critical' ? 'bg-red-500/8 border border-red-500/20' : 'bg-yellow-500/8 border border-yellow-500/20',
            )}>
              <Badge variant="status" status={r.severity} className="text-[9px] mt-0.5 shrink-0">{r.severity}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[var(--text-secondary)]">{r.name.replace(/_/g, ' ')}</div>
                <div className="text-[var(--text-muted)] mt-0.5">{r.description}</div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1">
                  <span className="text-[var(--accent-primary)]">{r.condition}</span>
                  {' → '}
                  <span>{r.actions.join(', ')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type CacheTab = 'instances' | 'cluster' | 'alerts';

export default function CachePage() {
  const [activeTab, setActiveTab] = useState<CacheTab>('instances');
  const instances = getRedisMetrics();
  const clusters = getRedisClusterMetrics();
  const alertRules = getCacheAlertRules();
  const alertEvents = getCacheAlertEvents();

  const totalInstances = instances.length;
  const avgHitRate = +(instances.reduce((s, i) => s + i.hitRate, 0) / instances.length).toFixed(1);
  const avgMemory = +(instances.reduce((s, i) => s + i.memoryPercent, 0) / instances.length).toFixed(1);
  const totalOps = instances.reduce((s, i) => s + i.opsPerSec, 0);

  const tabs: { id: CacheTab; label: string; count?: number }[] = [
    { id: 'instances', label: 'Instances' },
    { id: 'cluster', label: 'Cluster', count: clusters.length },
    { id: 'alerts', label: 'Alert Rules', count: alertEvents.length },
  ];

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

      {/* Tab Navigation */}
      <div className="flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              activeTab === t.id
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', activeTab === t.id ? 'bg-white/20' : 'bg-[var(--bg-secondary)]')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cluster View */}
      {activeTab === 'cluster' && (
        <div className="space-y-4">
          {clusters.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] text-sm">No Redis Cluster instances detected</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {clusters.map((c) => <ClusterCard key={`${c.host}:${c.port}`} cluster={c} />)}
            </div>
          )}
        </div>
      )}

      {/* Alert Rules View */}
      {activeTab === 'alerts' && (
        <AlertRulesPanel rules={alertRules} events={alertEvents} />
      )}

      {/* Instance Cards */}
      {activeTab === 'instances' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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
      </div>}
    </div>
  );
}
