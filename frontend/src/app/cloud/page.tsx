'use client';

import { useState, useMemo, useCallback } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Tabs, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { getCloudCostSummaries, getCloudResources, generateTimeSeries } from '@/lib/demo-data';
import { Cloud, DollarSign, TrendingDown, Server } from 'lucide-react';

const PROVIDER_COLORS: Record<string, string> = {
  aws: '#FF9900',
  gcp: '#4285F4',
  azure: '#0078D4',
};

const PROVIDER_LABELS: Record<string, string> = {
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
};

export default function CloudPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const demoCosts = useCallback(() => getCloudCostSummaries(), []);
  const demoResources = useCallback(() => getCloudResources(), []);
  const { data: summariesData, source } = useDataSource('/cloud/costs', demoCosts, { refreshInterval: 30_000 });
  const { data: resourcesData } = useDataSource('/cloud/resources', demoResources, { refreshInterval: 30_000 });
  const summaries = summariesData ?? [];
  const resources = resourcesData ?? [];

  const totalCost = useMemo(
    () => summaries.reduce((sum, s) => sum + s.totalCost, 0),
    [summaries],
  );

  const costTrendSeries = useMemo(
    () =>
      summaries.map((s) => ({
        name: PROVIDER_LABELS[s.provider] ?? s.provider,
        data: generateTimeSeries(s.totalCost, s.totalCost * 0.08, 30),
        type: 'area' as const,
        color: PROVIDER_COLORS[s.provider],
      })),
    [summaries],
  );

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'resources', label: 'Resources' },
    { id: 'recommendations', label: 'Recommendations' },
  ];

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Multi-Cloud', icon: <Cloud size={14} /> },
        ]}
      />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Multi-Cloud Integration</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          helpId="total-cloud-cost"
          title="Total Cloud Cost"
          value={`$${totalCost.toLocaleString()}`}
          unit="/mo"
          status="healthy"
        />
        {summaries.map((s) => (
          <KPICard
            helpId="cloud-provider-cost"
            key={s.provider}
            title={PROVIDER_LABELS[s.provider] ?? s.provider}
            value={`$${s.totalCost.toLocaleString()}`}
            unit="/mo"
            trend={{
              direction: s.trend > 0 ? 'up' : 'down',
              value: `${s.trend > 0 ? '+' : ''}${s.trend}%`,
              positive: s.trend < 0,
            }}
          />
        ))}
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Provider cost breakdown cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {summaries.map((s) => (
              <Card key={s.provider}>
                <CardHeader>
                  <CardTitle>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: PROVIDER_COLORS[s.provider] }}
                      />
                      {PROVIDER_LABELS[s.provider]}
                    </span>
                  </CardTitle>
                  <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                    ${s.totalCost.toLocaleString()}/mo
                  </span>
                </CardHeader>
                <div className="space-y-2">
                  {[
                    { label: 'Compute', value: s.computeCost },
                    { label: 'Storage', value: s.storageCost },
                    { label: 'Network', value: s.networkCost },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--text-secondary)]">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(item.value / s.totalCost) * 100}%`,
                              backgroundColor: PROVIDER_COLORS[s.provider],
                            }}
                          />
                        </div>
                        <span className="text-[var(--text-primary)] tabular-nums w-16 text-right font-medium">
                          ${item.value.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* 30-day cost trend */}
          <Card>
            <CardHeader>
              <CardTitle>30-Day Cost Trend</CardTitle>
            </CardHeader>
            <TimeSeriesChart
              series={costTrendSeries}
              yAxisLabel="$/month"
              height={280}
            />
          </Card>
        </div>
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left px-4 py-2.5 font-medium">Provider</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Region</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Monthly Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium">CPU%</th>
                  <th className="text-right px-4 py-2.5 font-medium">Memory%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-muted)]">
                {resources.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 text-white whitespace-nowrap"
                        style={{ backgroundColor: PROVIDER_COLORS[r.provider] }}
                      >
                        {PROVIDER_LABELS[r.provider]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{r.type}</td>
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{r.region}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="status"
                        status={r.status === 'running' ? 'healthy' : r.status === 'stopped' ? 'warning' : 'offline'}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-primary)] tabular-nums font-medium">
                      {r.monthlyCost > 0 ? `$${r.monthlyCost.toLocaleString()}` : '--'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          r.cpuUsage >= 80
                            ? 'text-[var(--status-critical)]'
                            : r.cpuUsage >= 60
                              ? 'text-[var(--status-warning)]'
                              : 'text-[var(--text-secondary)]'
                        }
                      >
                        {r.cpuUsage > 0 ? `${r.cpuUsage}%` : '--'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span
                        className={
                          r.memoryUsage >= 80
                            ? 'text-[var(--status-critical)]'
                            : r.memoryUsage >= 60
                              ? 'text-[var(--status-warning)]'
                              : 'text-[var(--text-secondary)]'
                        }
                      >
                        {r.memoryUsage > 0 ? `${r.memoryUsage}%` : '--'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Reserved Instances */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <DollarSign size={14} className="text-[var(--status-healthy)]" />
                  Reserved Instances
                </span>
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Switch 3 on-demand instances to reserved for estimated savings.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Current Cost</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">$6,080/mo</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Reserved Cost</span>
                <span className="text-[var(--status-healthy)] font-medium tabular-nums">$3,890/mo</span>
              </div>
              <div className="flex justify-between text-xs border-t border-[var(--border-muted)] pt-2">
                <span className="text-[var(--text-primary)] font-medium">Savings</span>
                <span className="text-[var(--status-healthy)] font-semibold tabular-nums">$2,190/mo (36%)</span>
              </div>
            </div>
          </Card>

          {/* Unused Resources */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Server size={14} className="text-[var(--status-warning)]" />
                  Unused Resources
                </span>
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              1 stopped instance and 2 unattached volumes detected.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Stopped Instances</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">1 resource</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Unattached Volumes</span>
                <span className="text-[var(--text-primary)] font-medium tabular-nums">2 resources</span>
              </div>
              <div className="flex justify-between text-xs border-t border-[var(--border-muted)] pt-2">
                <span className="text-[var(--text-primary)] font-medium">Potential Savings</span>
                <span className="text-[var(--status-healthy)] font-semibold tabular-nums">$340/mo</span>
              </div>
            </div>
          </Card>

          {/* Right-sizing */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <TrendingDown size={14} className="text-[var(--accent-primary)]" />
                  Right-sizing
                </span>
              </CardTitle>
            </CardHeader>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              2 instances are over-provisioned based on utilization data.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">api-gateway-01</span>
                <span className="text-[var(--text-secondary)]">CPU 45% avg — downsize to m6i.large</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">rag-cluster</span>
                <span className="text-[var(--text-secondary)]">CPU 52% avg — reduce node count</span>
              </div>
              <div className="flex justify-between text-xs border-t border-[var(--border-muted)] pt-2">
                <span className="text-[var(--text-primary)] font-medium">Potential Savings</span>
                <span className="text-[var(--status-healthy)] font-semibold tabular-nums">$580/mo</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
