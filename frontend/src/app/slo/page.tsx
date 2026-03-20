'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { getSLODefinitions, generateTimeSeries } from '@/lib/demo-data';
import { Target, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_CONFIG = {
  met: { label: 'Met', color: 'text-[var(--status-healthy)]', bg: 'bg-[var(--status-healthy-bg)]', icon: <CheckCircle2 size={13} /> },
  at_risk: { label: 'At Risk', color: 'text-[var(--status-warning)]', bg: 'bg-[var(--status-warning-bg)]', icon: <AlertTriangle size={13} /> },
  breached: { label: 'Breached', color: 'text-[var(--status-critical)]', bg: 'bg-[var(--status-critical-bg)]', icon: <XCircle size={13} /> },
};

export default function SLOPage() {
  const slos = useMemo(() => getSLODefinitions(), []);

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total SLOs" value={slos.length} subtitle={`${stats.met} met`} status="healthy" />
        <KPICard title="Avg Compliance" value={`${stats.avgCompliance.toFixed(1)}%`} status={stats.avgCompliance >= 99 ? 'healthy' : 'warning'} />
        <KPICard title="At Risk" value={stats.atRisk} status={stats.atRisk > 0 ? 'warning' : 'healthy'} />
        <KPICard title="Breached" value={stats.breached} status={stats.breached > 0 ? 'critical' : 'healthy'} />
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
    </div>
  );
}
