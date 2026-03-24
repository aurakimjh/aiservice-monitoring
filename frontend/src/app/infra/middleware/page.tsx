'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getMiddlewareRuntimes, getConnPoolAlertEvents } from '@/lib/demo-data';
import type { MiddlewareRuntime, ConnectionPoolMetrics } from '@/types/monitoring';
import { Server, Layers, Activity, AlertTriangle, ExternalLink } from 'lucide-react';

const LANG_LABELS: Record<string, string> = {
  java:   'Java',
  dotnet: '.NET',
  nodejs: 'Node.js',
  python: 'Python',
  go:     'Go',
};

const LANG_COLORS: Record<string, string> = {
  java:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  dotnet: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  nodejs: 'bg-green-500/15 text-green-400 border-green-500/30',
  python: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  go:     'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

type LangFilter = 'all' | 'java' | 'dotnet' | 'nodejs' | 'python' | 'go';

// ── Thread Pool Card ──────────────────────────────────────────────────────────
function ThreadPoolCard({ pool }: { pool: NonNullable<MiddlewareRuntime['threadPools']>[0] }) {
  const pct = Math.round(pool.utilization * 100);
  const color = pct >= 90 ? 'var(--status-critical)' : pct >= 70 ? 'var(--status-warning)' : 'var(--status-healthy)';
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{pool.name}</span>
        <span className="text-xs tabular-nums" style={{ color }}>{pct}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--text-muted)]">
        <div><span className="block tabular-nums text-[var(--text-secondary)] text-xs">{pool.activeThreads}</span>Active</div>
        <div><span className="block tabular-nums text-[var(--text-secondary)] text-xs">{pool.maxThreads}</span>Max</div>
        <div><span className="block tabular-nums text-[var(--text-secondary)] text-xs">{pool.queuedTasks}</span>Queued</div>
      </div>
      {/* Utilization bar */}
      <div className="h-1.5 w-full rounded-full bg-[var(--bg-secondary)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {/* Queue sparkline via ECharts */}
      <EChartsWrapper
        style={{ height: 32 }}
        option={{
          grid: { top: 0, bottom: 0, left: 0, right: 0 },
          xAxis: { type: 'category', show: false, data: Array.from({ length: 12 }, (_, i) => i) },
          yAxis: { type: 'value', show: false },
          series: [{
            type: 'line',
            smooth: true,
            symbol: 'none',
            data: Array.from({ length: 12 }, () => Math.floor(Math.random() * pool.queuedTasks * 2 + 1)),
            lineStyle: { color: 'var(--status-warning)', width: 1.5 },
            areaStyle: { color: 'var(--status-warning)', opacity: 0.1 },
          }],
        }}
      />
    </div>
  );
}

// ── Event Loop Card ───────────────────────────────────────────────────────────
function EventLoopCard({ el }: { el: NonNullable<MiddlewareRuntime['eventLoop']> }) {
  const lagColor = el.lagMs >= 500 ? 'var(--status-critical)' : el.lagMs >= 100 ? 'var(--status-warning)' : 'var(--status-healthy)';
  const lagData = Array.from({ length: 20 }, () => +(Math.random() * el.lagMs * 2).toFixed(1));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
          <div className="text-lg font-mono font-bold" style={{ color: lagColor }}>{el.lagMs.toFixed(1)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Lag (ms)</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
          <div className="text-lg font-mono font-bold text-[var(--status-warning)]">{el.lagP99Ms.toFixed(1)}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">P99 Lag (ms)</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
          <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{el.activeHandles}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Handles</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
          <div className="text-lg font-mono font-bold text-[var(--text-primary)]">{el.activeRequests}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Requests</div>
        </div>
      </div>
      <EChartsWrapper
        style={{ height: 100 }}
        option={{
          grid: { top: 8, bottom: 24, left: 40, right: 16 },
          xAxis: { type: 'category', data: lagData.map((_, i) => i), axisLabel: { show: false } },
          yAxis: { type: 'value', name: 'ms', nameTextStyle: { color: 'var(--text-muted)', fontSize: 10 }, axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
          series: [
            {
              type: 'line', smooth: true, symbol: 'none',
              data: lagData,
              lineStyle: { color: lagColor, width: 2 },
              areaStyle: { color: lagColor, opacity: 0.12 },
            },
            {
              type: 'line', symbol: 'none', silent: true,
              data: Array(lagData.length).fill(100),
              lineStyle: { color: 'var(--status-warning)', type: 'dashed', width: 1 },
            },
          ],
          tooltip: { trigger: 'axis', formatter: (p: any) => `Lag: ${p[0].value}ms` },
        }}
      />
      <div className="text-[10px] text-[var(--text-muted)] text-right">--- 100ms warning threshold</div>
    </div>
  );
}

// ── Worker Pool Card ──────────────────────────────────────────────────────────
function WorkerPoolCard({ workers }: { workers: NonNullable<MiddlewareRuntime['workers']> }) {
  const pct = Math.round((workers.active / Math.max(workers.max, 1)) * 100);
  const barColor = pct >= 90 ? 'var(--status-critical)' : pct >= 70 ? 'var(--status-warning)' : 'var(--status-healthy)';
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {(['active', 'idle', 'max'] as const).map((key) => (
          <div key={key} className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
            <div className="text-xl font-mono font-bold text-[var(--text-primary)]">{workers[key]}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5 capitalize">{key}</div>
          </div>
        ))}
      </div>
      <EChartsWrapper
        style={{ height: 80 }}
        option={{
          grid: { top: 4, bottom: 4, left: 4, right: 4 },
          xAxis: { type: 'category', show: false, data: ['Active', 'Idle', 'Free'] },
          yAxis: { type: 'value', show: false, max: workers.max },
          series: [{
            type: 'bar',
            data: [
              { value: workers.active, itemStyle: { color: barColor } },
              { value: workers.idle, itemStyle: { color: 'var(--status-healthy)' } },
              { value: Math.max(0, workers.max - workers.active - workers.idle), itemStyle: { color: 'var(--bg-tertiary)' } },
            ],
            barWidth: 24,
          }],
          tooltip: { show: false },
        }}
      />
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-muted)]">Utilization</span>
        <span className="tabular-nums font-medium" style={{ color: barColor }}>{pct}%</span>
      </div>
    </div>
  );
}

// ── Goroutine Card ────────────────────────────────────────────────────────────
function GoroutineCard({ count, hostname }: { count: number; hostname: string }) {
  const baseline = 50;
  const threshold = baseline * 2;
  const isLeak = count >= threshold;
  const lineColor = isLeak ? 'var(--status-critical)' : 'var(--status-healthy)';
  const histData = Array.from({ length: 20 }, (_, i) =>
    Math.max(20, count + Math.floor(Math.sin(i) * count * 0.3))
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cn('px-4 py-3 rounded-lg flex-1 text-center', isLeak ? 'bg-red-500/10 border border-red-500/30' : 'bg-[var(--bg-tertiary)]')}>
          <div className="text-2xl font-mono font-bold" style={{ color: lineColor }}>{count.toLocaleString()}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Goroutines</div>
        </div>
        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] text-center">
          <div className="text-lg font-mono font-bold text-[var(--text-muted)]">{threshold}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Threshold</div>
        </div>
      </div>
      {isLeak && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          <AlertTriangle size={12} />
          <span>Possible goroutine leak detected (count ≥ baseline × 2)</span>
        </div>
      )}
      <EChartsWrapper
        style={{ height: 90 }}
        option={{
          grid: { top: 4, bottom: 20, left: 40, right: 16 },
          xAxis: { type: 'category', data: histData.map((_, i) => i), axisLabel: { show: false } },
          yAxis: { type: 'value', axisLabel: { color: 'var(--text-muted)', fontSize: 10 } },
          series: [
            {
              type: 'line', smooth: true, symbol: 'none',
              data: histData,
              lineStyle: { color: lineColor, width: 2 },
              areaStyle: { color: lineColor, opacity: 0.1 },
            },
            {
              type: 'line', symbol: 'none', silent: true,
              data: Array(histData.length).fill(threshold),
              lineStyle: { color: 'var(--status-critical)', type: 'dashed', width: 1 },
            },
          ],
          tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].value} goroutines` },
        }}
      />
      <div className="flex justify-end gap-3 text-[10px] text-[var(--text-muted)]">
        <a
          href={`http://${hostname}:6060/debug/pprof/goroutine?debug=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ExternalLink size={10} />pprof
        </a>
      </div>
    </div>
  );
}

// ── Connection Pool Row ───────────────────────────────────────────────────────
function ConnPoolRow({ pool }: { pool: ConnectionPoolMetrics }) {
  const pct = Math.round(pool.utilization * 100);
  const color = pool.leakSuspected ? 'var(--status-critical)' : pct >= 90 ? 'var(--status-critical)' : pct >= 70 ? 'var(--status-warning)' : 'var(--status-healthy)';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--border-muted)] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{pool.name}</span>
          {pool.leakSuspected && (
            <Badge variant="status" status="critical" className="text-[9px]">leak</Badge>
          )}
        </div>
        <div className="h-1.5 w-full mt-1 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 text-[10px] text-right text-[var(--text-muted)] shrink-0">
        <div><span className="block text-xs tabular-nums text-[var(--text-secondary)]">{pool.activeConnections}</span>Active</div>
        <div><span className="block text-xs tabular-nums text-[var(--text-secondary)]">{pool.idleConnections}</span>Idle</div>
        <div><span className="block text-xs tabular-nums text-[var(--text-secondary)]">{pool.maxConnections}</span>Max</div>
        <div><span className="block text-xs tabular-nums" style={{ color }}>{pct}%</span>Use</div>
      </div>
    </div>
  );
}

// ── Runtime Host Card ─────────────────────────────────────────────────────────
function RuntimeCard({ runtime }: { runtime: MiddlewareRuntime }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Badge variant="status" className={cn('text-[10px] uppercase font-bold', LANG_COLORS[runtime.language])}>
              {LANG_LABELS[runtime.language]}
            </Badge>
            <CardTitle>{runtime.hostname}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <div className="px-4 pb-4 space-y-4">
        {/* Thread Pools (Java / .NET) */}
        {runtime.threadPools && runtime.threadPools.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Thread Pool</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {runtime.threadPools.map((tp) => <ThreadPoolCard key={tp.name} pool={tp} />)}
            </div>
          </div>
        )}
        {/* Event Loop (Node.js) */}
        {runtime.eventLoop && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Event Loop</h4>
            <EventLoopCard el={runtime.eventLoop} />
          </div>
        )}
        {/* Worker Pool (Python) */}
        {runtime.workers && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Worker Pool</h4>
            <WorkerPoolCard workers={runtime.workers} />
          </div>
        )}
        {/* Goroutines (Go) */}
        {runtime.goroutines !== undefined && (
          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Goroutines</h4>
            <GoroutineCard count={runtime.goroutines} hostname={runtime.hostname} />
          </div>
        )}
        {/* Connection Pools */}
        {runtime.connectionPools && runtime.connectionPools.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Connection Pool</h4>
            {runtime.connectionPools.map((cp) => <ConnPoolRow key={cp.name} pool={cp} />)}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MiddlewarePage() {
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const runtimes = getMiddlewareRuntimes();
  const alerts = getConnPoolAlertEvents();

  const filtered = langFilter === 'all' ? runtimes : runtimes.filter((r) => r.language === langFilter);

  const totalHosts = runtimes.length;
  const langs = [...new Set(runtimes.map((r) => r.language))];
  const totalConnPools = runtimes.reduce((s, r) => s + (r.connectionPools?.length ?? 0), 0);
  const leakAlerts = runtimes.reduce(
    (s, r) => s + (r.connectionPools?.filter((cp) => cp.leakSuspected).length ?? 0),
    0,
  );

  const FILTERS: LangFilter[] = ['all', 'java', 'dotnet', 'nodejs', 'python', 'go'];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: 'Middleware Runtime', icon: <Layers size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Middleware Runtime Monitoring</h1>
        <a href="/infra/middleware/connection-pool" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors">
          <Activity size={12} />Connection Pool Dashboard
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Monitored Hosts" value={totalHosts} status="healthy" />
        <KPICard title="Languages" value={langs.length} status="healthy" />
        <KPICard title="Connection Pools" value={totalConnPools} status="healthy" />
        <KPICard
          title="Leak Alerts"
          value={leakAlerts + alerts.length}
          status={leakAlerts + alerts.length > 0 ? 'critical' : 'healthy'}
        />
      </div>

      {/* Active Connection Pool Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--status-warning)]" />
              <CardTitle>Active Connection Pool Alerts</CardTitle>
              <Badge variant="status" status="warning">{alerts.length}</Badge>
            </div>
          </CardHeader>
          <div className="px-4 pb-4 space-y-2">
            {alerts.map((a) => (
              <div key={a.alertId} className={cn(
                'p-2 rounded-lg text-xs flex items-start gap-2',
                a.severity === 'critical' ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400',
              )}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">[{a.severity}]</span> {a.message}
                </div>
                <span className="text-[10px] text-[var(--text-muted)] shrink-0">{a.action}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Language Filter Tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setLangFilter(f)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              langFilter === f
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {f === 'all' ? 'All' : LANG_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Runtime Cards Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filtered.map((r) => <RuntimeCard key={r.hostId} runtime={r} />)}
      </div>
    </div>
  );
}
