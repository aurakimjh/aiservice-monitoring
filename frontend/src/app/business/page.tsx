'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Tabs, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { getBusinessKPIs, getCorrelationData, getROIData } from '@/lib/demo-data';
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Target,
} from 'lucide-react';

const TABS = [
  { id: 'correlation', label: 'Correlation', icon: <BarChart3 size={13} /> },
  { id: 'roi', label: 'ROI', icon: <DollarSign size={13} /> },
  { id: 'metrics', label: 'Metrics', icon: <Target size={13} /> },
];

const CATEGORY_COLORS: Record<string, string> = {
  revenue: '#3FB950',
  conversion: '#58A6FF',
  retention: '#BC8CFF',
  efficiency: '#D29922',
};

export default function BusinessKPIPage() {
  const [activeTab, setActiveTab] = useState('correlation');
  const demoKPIs = useCallback(() => getBusinessKPIs(), []);
  const demoCorrelation = useCallback(() => getCorrelationData(), []);
  const demoROI = useCallback(() => getROIData(), []);
  const { data: kpisData, source } = useDataSource('/business/kpis', demoKPIs, { refreshInterval: 30_000 });
  const { data: correlationResult } = useDataSource('/business/correlation', demoCorrelation, { refreshInterval: 30_000 });
  const { data: roiResult } = useDataSource('/business/roi', demoROI, { refreshInterval: 30_000 });
  const kpis = kpisData ?? [];
  const correlationData = correlationResult ?? [];
  const roiData = roiResult ?? [];

  const topKPIs = kpis.slice(0, 4);

  const roiTotals = useMemo(() => {
    const investment = roiData.reduce((s, r) => s + r.investment, 0);
    const revenue = roiData.reduce((s, r) => s + r.revenue, 0);
    const savings = roiData.reduce((s, r) => s + r.savings, 0);
    const roi = investment > 0 ? Math.round(((revenue + savings - investment) / investment) * 100) : 0;
    return { investment, revenue, savings, roi };
  }, [roiData]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Business KPI', icon: <TrendingUp size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Business KPI Integration</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {topKPIs.map((kpi) => (
          <KPICard
            key={kpi.id}
            title={kpi.name}
            value={kpi.unit === '$/month' ? `$${kpi.value.toLocaleString()}` : `${kpi.value}`}
            unit={kpi.unit === '$/month' ? '/mo' : kpi.unit === '$' ? '' : undefined}
            trend={{
              direction: kpi.trend >= 0 ? 'up' : 'down',
              value: `${kpi.trend >= 0 ? '+' : ''}${kpi.trend}%`,
              positive: kpi.name === 'Cost per Transaction' ? kpi.trend < 0 : kpi.trend >= 0,
            }}
          />
        ))}
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Correlation Tab */}
      {activeTab === 'correlation' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>TTFT (seconds) vs Conversion Rate (%)</CardTitle>
            </CardHeader>
            <p className="text-xs text-[var(--text-muted)]">
              Scatter plot visualization — Lower TTFT (Time to First Token) correlates with higher conversion rates.
              Services with faster response times show significantly better business outcomes.
            </p>
          </Card>

          <Card padding="none">
            <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Correlation Data</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-muted)]">
                    <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">Service</th>
                    <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">TTFT (s)</th>
                    <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Conversion (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {correlationData.map((point, i) => {
                    const isLowTTFT = point.aiMetric <= 1.0;
                    const isHighTTFT = point.aiMetric >= 2.5;
                    return (
                      <tr
                        key={i}
                        className={cn(
                          'border-b border-[var(--border-muted)] transition-colors',
                          isLowTTFT && 'bg-[var(--status-healthy)]/8',
                          isHighTTFT && 'bg-[var(--status-critical)]/8',
                        )}
                      >
                        <td className="px-4 py-2.5 text-[var(--text-primary)]">
                          <div className="flex items-center gap-2">
                            {isLowTTFT && <span className="w-2 h-2 rounded-full bg-[var(--status-healthy)]" />}
                            {isHighTTFT && <span className="w-2 h-2 rounded-full bg-[var(--status-critical)]" />}
                            {!isLowTTFT && !isHighTTFT && <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />}
                            {point.label}
                          </div>
                        </td>
                        <td className={cn(
                          'text-right px-4 py-2.5 tabular-nums font-medium',
                          isLowTTFT ? 'text-[var(--status-healthy)]' : isHighTTFT ? 'text-[var(--status-critical)]' : 'text-[var(--text-primary)]',
                        )}>
                          {point.aiMetric.toFixed(1)}
                        </td>
                        <td className="text-right px-4 py-2.5 tabular-nums font-medium text-[var(--text-primary)]">
                          {point.bizMetric.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ROI Tab */}
      {activeTab === 'roi' && (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
            <span className="text-xs font-semibold text-[var(--text-primary)]">ROI Analysis</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-muted)]">
                  <th className="text-left px-4 py-2 text-[var(--text-muted)] font-medium">Category</th>
                  <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Investment</th>
                  <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Revenue</th>
                  <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">Savings</th>
                  <th className="text-right px-4 py-2 text-[var(--text-muted)] font-medium">ROI %</th>
                </tr>
              </thead>
              <tbody>
                {roiData.map((entry) => (
                  <tr key={entry.category} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">{entry.category}</td>
                    <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                      ${entry.investment.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                      ${entry.revenue.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">
                      ${entry.savings.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums font-semibold">
                      <span className={cn(
                        entry.roi > 500 ? 'text-[var(--status-healthy)]' :
                        entry.roi > 300 ? 'text-[#58A6FF]' :
                        'text-[var(--text-muted)]',
                      )}>
                        {entry.roi}%
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Summary row */}
                <tr className="bg-[var(--bg-tertiary)] font-semibold">
                  <td className="px-4 py-2.5 text-[var(--text-primary)]">Total</td>
                  <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-primary)]">
                    ${roiTotals.investment.toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-primary)]">
                    ${roiTotals.revenue.toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2.5 tabular-nums text-[var(--text-primary)]">
                    ${roiTotals.savings.toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2.5 tabular-nums">
                    <span className={cn(
                      roiTotals.roi > 500 ? 'text-[var(--status-healthy)]' :
                      roiTotals.roi > 300 ? 'text-[#58A6FF]' :
                      'text-[var(--text-muted)]',
                    )}>
                      {roiTotals.roi}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {kpis.map((kpi) => {
            const isPositive = kpi.name === 'Cost per Transaction' ? kpi.trend < 0 : kpi.trend >= 0;
            return (
              <Card key={kpi.id}>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">{kpi.name}</span>
                      <Badge className={cn(
                        'text-[10px]',
                        `bg-[${CATEGORY_COLORS[kpi.category]}]/15`,
                      )}>
                        {kpi.category}
                      </Badge>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                        {kpi.unit === '$/month' ? `$${kpi.value.toLocaleString()}` :
                         kpi.unit === '$' ? `$${kpi.value}` :
                         kpi.value}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{kpi.unit}</span>
                    </div>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-xs font-medium',
                    isPositive
                      ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                      : 'bg-[var(--status-critical)]/10 text-[var(--status-critical)]',
                  )}>
                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {kpi.trend >= 0 ? '+' : ''}{kpi.trend}%
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
