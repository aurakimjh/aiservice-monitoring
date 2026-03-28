'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getMiddlewareRuntimes, getConnPoolAlertEvents } from '@/lib/demo-data';
import type { ConnectionPoolMetrics, ConnPoolAlertEvent } from '@/types/monitoring';
import { Server, Layers, Activity, AlertTriangle, Database } from 'lucide-react';

const VENDOR_LABELS: Record<string, string> = {
  hikaricp: 'HikariCP',
  dbcp: 'DBCP2',
  c3p0: 'C3P0',
  ef_core: 'EF Core',
  'pg-pool': 'pg-pool',
  sqlalchemy: 'SQLAlchemy',
  sql_db: 'sql.DB',
  mongoose: 'Mongoose',
  django: 'Django ORM',
};

interface FlatPool extends ConnectionPoolMetrics {
  hostname: string;
  language: string;
}

function flattenPools(): FlatPool[] {
  const runtimes = getMiddlewareRuntimes();
  const result: FlatPool[] = [];
  for (const r of runtimes) {
    for (const cp of r.connectionPools ?? []) {
      result.push({ ...cp, hostname: r.hostname, language: r.language });
    }
  }
  return result;
}

// ── Utilization Gauge ─────────────────────────────────────────────────────────
function UtilizationGauge({ pool }: { pool: FlatPool }) {
  const pct = Math.round(pool.utilization * 100);
  const color = pool.leakSuspected
    ? '#ef4444'
    : pct >= 90 ? 'var(--status-critical)'
    : pct >= 70 ? 'var(--status-warning)'
    : 'var(--status-healthy)';

  return (
    <EChartsWrapper
      style={{ height: 120 }}
      option={{
        series: [{
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 4,
          radius: '90%',
          center: ['50%', '65%'],
          axisLine: {
            lineStyle: {
              width: 10,
              color: [
                [0.7, 'var(--status-healthy)'],
                [0.9, 'var(--status-warning)'],
                [1, 'var(--status-critical)'],
              ],
            },
          },
          pointer: { length: '65%', width: 4, itemStyle: { color } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: {
            formatter: `${pct}%`,
            color,
            fontSize: 14,
            fontWeight: 'bold',
            offsetCenter: [0, '20%'],
          },
          data: [{ value: pct }],
        }],
      }}
    />
  );
}

// ── Wait Time Histogram ───────────────────────────────────────────────────────
function WaitHistogram({ pool }: { pool: FlatPool }) {
  // Simulate P50/P95/P99 wait times based on waitCount
  const p50 = pool.waitCount > 0 ? Math.random() * 50 + 10 : 0;
  const p95 = p50 * 3;
  const p99 = p50 * 6;

  return (
    <EChartsWrapper
      style={{ height: 80 }}
      option={{
        grid: { top: 4, bottom: 20, left: 36, right: 8 },
        xAxis: {
          type: 'category',
          data: ['P50', 'P95', 'P99'],
          axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
          axisTick: { show: false },
          axisLine: { show: false },
        },
        yAxis: {
          type: 'value',
          name: 'ms',
          nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 },
          axisLabel: { color: 'var(--text-muted)', fontSize: 9 },
          splitLine: { lineStyle: { color: 'var(--border-muted)' } },
        },
        series: [{
          type: 'bar',
          data: [
            { value: +p50.toFixed(1), itemStyle: { color: 'var(--status-healthy)' } },
            { value: +p95.toFixed(1), itemStyle: { color: 'var(--status-warning)' } },
            { value: +p99.toFixed(1), itemStyle: { color: 'var(--status-critical)' } },
          ],
          barMaxWidth: 18,
        }],
        tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].name}: ${p[0].value}ms` },
      }}
    />
  );
}

// ── Pool Detail Card ──────────────────────────────────────────────────────────
function PoolCard({ pool }: { pool: FlatPool }) {
  const pct = Math.round(pool.utilization * 100);
  const statusColor = pool.leakSuspected ? 'critical' : pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'healthy';

  return (
    <Card className={pool.leakSuspected ? 'border-red-500/40' : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Database size={13} className="text-[var(--text-muted)]" />
            <CardTitle>{pool.name}</CardTitle>
            {pool.leakSuspected && (
              <Badge variant="status" status="critical" className="text-[9px]">
                <AlertTriangle size={9} className="mr-0.5" />leak
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="status" status={statusColor}>{pct}%</Badge>
            <span className="text-[10px] text-[var(--text-muted)]">{pool.hostname}</span>
          </div>
        </div>
      </CardHeader>
      <div className="px-4 pb-4 grid grid-cols-2 gap-4">
        {/* Left: gauge + stats */}
        <div>
          <UtilizationGauge pool={pool} />
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Active</span>
              <span className="tabular-nums text-[var(--text-secondary)]">{pool.activeConnections}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Idle</span>
              <span className="tabular-nums text-[var(--text-secondary)]">{pool.idleConnections}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Max</span>
              <span className="tabular-nums text-[var(--text-secondary)]">{pool.maxConnections}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Wait</span>
              <span className={cn('tabular-nums', pool.waitCount > 0 ? 'text-[var(--status-warning)]' : 'text-[var(--text-secondary)]')}>
                {pool.waitCount}
              </span>
            </div>
          </div>
        </div>
        {/* Right: wait time histogram */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] mb-1 font-semibold uppercase">Wait Time</div>
          <WaitHistogram pool={pool} />
          {pool.waitCount > 0 && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--status-warning)]">
              <AlertTriangle size={10} />
              <span>{pool.waitCount} pending requests</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ConnectionPoolPage() {
  const demoPools = useCallback(() => flattenPools(), []);
  const demoAlerts = useCallback(() => getConnPoolAlertEvents(), []);
  const { data: poolsData, source } = useDataSource('/infra/middleware/pools', demoPools, { refreshInterval: 30_000 });
  const { data: alertsData } = useDataSource('/infra/middleware/pool-alerts', demoAlerts, { refreshInterval: 30_000 });
  const pools: FlatPool[] = Array.isArray(poolsData) ? poolsData : (poolsData as any)?.items ?? flattenPools();
  const alerts: ConnPoolAlertEvent[] = Array.isArray(alertsData) ? alertsData : (alertsData as any)?.items ?? getConnPoolAlertEvents();

  const totalPools = pools.length;
  const avgUtil = pools.length > 0
    ? +(pools.reduce((s, p) => s + p.utilization, 0) / pools.length * 100).toFixed(1)
    : 0;
  const leakCount = pools.filter((p) => p.leakSuspected).length;
  const waitingCount = pools.filter((p) => p.waitCount > 0).length;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: 'Middleware', href: '/infra/middleware', icon: <Layers size={14} /> },
        { label: 'Connection Pool', icon: <Activity size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Connection Pool Dashboard</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Pools" value={totalPools} status="healthy" />
        <KPICard
          title="Avg Utilization"
          value={avgUtil}
          unit="%"
          status={avgUtil >= 90 ? 'critical' : avgUtil >= 70 ? 'warning' : 'healthy'}
        />
        <KPICard
          title="Leak Suspects"
          value={leakCount}
          status={leakCount > 0 ? 'critical' : 'healthy'}
        />
        <KPICard
          title="Waiting Requests"
          value={waitingCount}
          status={waitingCount > 0 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Alert Rule Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Rules (26-2-2)</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { severity: 'warning', rule: 'active/max ≥ 90%', action: 'PagerDuty + Slack' },
              { severity: 'critical', rule: 'active/max ≥ 98%', action: 'PagerDuty' },
              { severity: 'warning', rule: 'wait_count > 0 for 30s', action: 'PagerDuty' },
              { severity: 'critical', rule: 'leak_suspected == true', action: 'PagerDuty + Slack' },
            ].map((r) => (
              <div key={r.rule} className={cn(
                'flex items-center gap-2 p-2 rounded-lg text-xs',
                r.severity === 'critical' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20',
              )}>
                <Badge variant="status" status={r.severity as any} className="text-[9px] shrink-0">{r.severity}</Badge>
                <span className="text-[var(--text-secondary)] flex-1">{r.rule}</span>
                <span className="text-[var(--text-muted)] shrink-0">{r.action}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--status-warning)]" />
              <CardTitle>Active Alerts</CardTitle>
              <Badge variant="status" status="warning">{alerts.length}</Badge>
            </div>
          </CardHeader>
          <div className="px-4 pb-4 space-y-2">
            {alerts.map((a) => (
              <div key={a.alertId} className={cn(
                'p-2 rounded-lg text-xs',
                a.severity === 'critical' ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400',
              )}>
                <span className="font-medium">[{a.severity}]</span> {a.message}
                <span className="ml-2 text-[var(--text-muted)]">→ {a.action}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pool Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {pools.map((p) => <PoolCard key={`${p.hostname}-${p.name}`} pool={p} />)}
      </div>
    </div>
  );
}
