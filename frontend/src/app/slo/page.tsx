'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn, getRelativeTime } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { getSLODefinitions, generateTimeSeries, getSyntheticProbes } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { Target, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Radio, Wifi, WifiOff } from 'lucide-react';

const STATUS_CONFIG = {
  met: { label: 'Met', color: 'text-[var(--status-healthy)]', bg: 'bg-[var(--status-healthy-bg)]', icon: <CheckCircle2 size={13} /> },
  at_risk: { label: 'At Risk', color: 'text-[var(--status-warning)]', bg: 'bg-[var(--status-warning-bg)]', icon: <AlertTriangle size={13} /> },
  breached: { label: 'Breached', color: 'text-[var(--status-critical)]', bg: 'bg-[var(--status-critical-bg)]', icon: <XCircle size={13} /> },
};

const SLO_TABS = [
  { id: 'slo', label: 'SLO Management', icon: <Target size={14} /> },
  { id: 'probes', label: 'Synthetic Probes', icon: <Radio size={14} /> },
] as const;

const PROBE_STATUS_CONFIG = {
  healthy: { color: 'bg-[var(--status-healthy)]', text: 'text-[var(--status-healthy)]', bg: 'bg-[var(--status-healthy)]/15' },
  degraded: { color: 'bg-[var(--status-warning)]', text: 'text-[var(--status-warning)]', bg: 'bg-[var(--status-warning)]/15' },
  down: { color: 'bg-[var(--status-critical)]', text: 'text-[var(--status-critical)]', bg: 'bg-[var(--status-critical)]/15' },
};

const PROBE_TYPE_COLORS: Record<string, string> = {
  http: 'bg-blue-500/15 text-blue-400',
  llm: 'bg-purple-500/15 text-purple-400',
  rag: 'bg-orange-500/15 text-orange-400',
  api: 'bg-green-500/15 text-green-400',
};

export default function SLOPage() {
  const demoSLOs = useCallback(() => getSLODefinitions(), []);
  const demoProbes = useCallback(() => getSyntheticProbes(), []);
  const { data: slosData, source } = useDataSource('/slo/definitions', demoSLOs, { refreshInterval: 30_000 });
  const { data: probesData } = useDataSource('/slo/probes', demoProbes, { refreshInterval: 30_000 });
  const slos = slosData ?? [];
  const [activeTab, setActiveTab] = useState<string>('slo');
  const probes = probesData ?? [];

  const stats = useMemo(() => {
    const met = slos.filter((s) => s.status === 'met').length;
    const atRisk = slos.filter((s) => s.status === 'at_risk').length;
    const breached = slos.filter((s) => s.status === 'breached').length;
    const avgCompliance = slos.length > 0 ? slos.reduce((s, d) => s + d.current, 0) / slos.length : 0;
    return { met, atRisk, breached, avgCompliance };
  }, [slos]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'SLO Management', icon: <Target size={14} /> },
      ]} />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">SLO Management</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)]">
        {SLO_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-[1px]',
              activeTab === tab.id
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'probes' && (
        <div className="space-y-4">
          {/* Probe KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard helpId="probe-total" title="Total Probes" value={probes.length} subtitle="Synthetic monitors" />
            <KPICard helpId="probe-healthy" title="Healthy" value={probes.filter((p) => p.status === 'healthy').length} status="healthy" subtitle="Operating normally" />
            <KPICard helpId="probe-degraded" title="Degraded" value={probes.filter((p) => p.status === 'degraded').length} status={probes.some((p) => p.status === 'degraded') ? 'warning' : 'healthy'} subtitle="Performance issues" />
            <KPICard helpId="probe-down" title="Down" value={probes.filter((p) => p.status === 'down').length} status={probes.some((p) => p.status === 'down') ? 'critical' : 'healthy'} subtitle="Unreachable" />
          </div>

          {/* Probe List */}
          <Card padding="none">
            <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
              <span className="text-xs font-medium text-[var(--text-primary)]">Probe Status</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                    <th className="px-4 py-2 font-medium">Interval</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Uptime</th>
                    <th className="px-4 py-2 font-medium text-right">Avg Latency</th>
                    <th className="px-4 py-2 font-medium text-right">Quality</th>
                    <th className="px-4 py-2 font-medium">Last Check</th>
                    <th className="px-4 py-2 font-medium">Last Error</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((probe) => {
                    const statusCfg = PROBE_STATUS_CONFIG[probe.status];
                    return (
                      <tr key={probe.id} className="border-b border-[var(--border-muted)]">
                        <td className="px-4 py-2 text-[var(--text-primary)] font-medium">{probe.name}</td>
                        <td className="px-4 py-2">
                          <span className={cn('px-2 py-0.5 text-[10px] font-medium rounded-full', PROBE_TYPE_COLORS[probe.type])}>
                            {probe.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-[var(--text-muted)] font-mono text-[10px] max-w-[200px] truncate">{probe.target}</td>
                        <td className="px-4 py-2 text-[var(--text-secondary)] tabular-nums">{probe.interval}</td>
                        <td className="px-4 py-2">
                          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full', statusCfg.bg, statusCfg.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.color)} />
                            {probe.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{probe.uptime}%</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{probe.avgLatencyMs > 0 ? `${probe.avgLatencyMs}ms` : '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{probe.qualityScore != null ? probe.qualityScore.toFixed(2) : '—'}</td>
                        <td className="px-4 py-2 text-[var(--text-muted)] tabular-nums">{getRelativeTime(new Date(probe.lastCheck))}</td>
                        <td className="px-4 py-2 text-[var(--status-critical)] text-[10px] max-w-[200px] truncate">{probe.lastError ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'slo' && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard helpId="slo-total" title="Total SLOs" value={slos.length} subtitle={`${stats.met} met`} status="healthy" />
        <KPICard helpId="slo-avg-compliance" title="Avg Compliance" value={`${stats.avgCompliance.toFixed(1)}%`} status={stats.avgCompliance >= 99 ? 'healthy' : 'warning'} />
        <KPICard helpId="slo-at-risk" title="At Risk" value={stats.atRisk} status={stats.atRisk > 0 ? 'warning' : 'healthy'} />
        <KPICard helpId="slo-breached" title="Breached" value={stats.breached} status={stats.breached > 0 ? 'critical' : 'healthy'} />
      </div>

      {/* SLO Cards */}
      <div className="space-y-3">
        {slos.map((slo) => {
          const cfg = STATUS_CONFIG[slo.status];
          const budgetColor = slo.errorBudgetRemaining > 50 ? 'bg-[var(--status-healthy)]' : slo.errorBudgetRemaining > 20 ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-critical)]';

          return (
            <Card key={slo.id}>
              <div className="flex items-start gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', cfg.color)}>{cfg.icon} {cfg.label}</span>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{slo.name}</span>
                    <Badge>{slo.service}</Badge>
                    <Badge>{slo.window}</Badge>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] mb-2">{slo.sli}</div>

                  <div className="grid grid-cols-4 gap-4 text-xs">
                    <div>
                      <div className="text-[var(--text-muted)]">Target</div>
                      <div className="font-semibold text-[var(--text-primary)] tabular-nums">{slo.target}%</div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Current</div>
                      <div className={cn('font-semibold tabular-nums', slo.current >= slo.target ? 'text-[var(--status-healthy)]' : 'text-[var(--status-critical)]')}>
                        {slo.current}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Burn Rate</div>
                      <div className={cn('font-semibold tabular-nums', slo.burnRate > 2 ? 'text-[var(--status-critical)]' : slo.burnRate > 1 ? 'text-[var(--status-warning)]' : 'text-[var(--text-primary)]')}>
                        {slo.burnRate}x
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)]">Error Budget</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', budgetColor)} style={{ width: `${slo.errorBudgetRemaining}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">{slo.errorBudgetRemaining}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: mini chart */}
                <div className="w-[200px] shrink-0">
                  <TimeSeriesChart
                    series={[{
                      name: 'Compliance',
                      data: generateTimeSeries(slo.current, (100 - slo.current) * 0.3, 30),
                      type: 'area',
                      color: slo.status === 'met' ? '#3FB950' : slo.status === 'at_risk' ? '#D29922' : '#F85149',
                    }]}
                    thresholdLine={{ value: slo.target, label: `${slo.target}%`, color: '#8B949E' }}
                    height={80}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      </>}
    </div>
  );
}
