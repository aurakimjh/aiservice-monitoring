'use client';

import { useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { getCostBreakdowns, generateTimeSeries } from '@/lib/demo-data';
import type { CostBreakdown } from '@/types/monitoring';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

export default function CostsPage() {
  const demoFallback = useCallback(() => getCostBreakdowns(), []);
  const { data: rawData, source } = useDataSource('/costs', demoFallback, { refreshInterval: 30_000 });
  const costs: CostBreakdown[] = Array.isArray(rawData) ? rawData : (rawData as any)?.items ?? [];

  const totalPerDay = useMemo(() => costs.reduce((s, c) => s + c.amount, 0), [costs]);
  const grouped = useMemo(() => {
    const groups: Record<string, { items: typeof costs; total: number }> = {};
    for (const c of costs) {
      if (!groups[c.category]) groups[c.category] = { items: [], total: 0 };
      groups[c.category].items.push(c);
      groups[c.category].total += c.amount;
    }
    return groups;
  }, [costs]);

  const categoryColors: Record<string, string> = {
    'LLM API': '#F778BA',
    'GPU Compute': '#BC8CFF',
    'Infrastructure': '#58A6FF',
    'Storage': '#3FB950',
    'External API': '#D29922',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pieOption = useMemo<any>(() => ({
    animation: false,
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      data: Object.entries(grouped).map(([cat, { total }]) => ({
        name: cat,
        value: Math.round(total * 10) / 10,
        itemStyle: { color: categoryColors[cat] ?? '#8B949E' },
      })),
      label: { show: true, formatter: '{b}\n${c}/day', fontSize: 10, color: '#8B949E' },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
    }],
    tooltip: { trigger: 'item', formatter: '{b}: ${c}/day ({d}%)' },
  }), [grouped]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Cost Analysis', icon: <DollarSign size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Cost Analysis</h1>
        <DataSourceBadge source={source} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Cost" value={`$${totalPerDay.toFixed(0)}`} unit="/day" trend={{ direction: 'up', value: '+4.2%', positive: false }} status="healthy" />
        <KPICard title="Monthly Estimate" value={`$${(totalPerDay * 30).toFixed(0)}`} subtitle="projected" />
        <KPICard title="LLM API" value={`$${grouped['LLM API']?.total.toFixed(0) ?? 0}`} unit="/day" subtitle={`${((grouped['LLM API']?.total ?? 0) / totalPerDay * 100).toFixed(0)}% of total`} status="warning" />
        <KPICard title="GPU Compute" value={`$${grouped['GPU Compute']?.total.toFixed(0) ?? 0}`} unit="/day" subtitle={`${((grouped['GPU Compute']?.total ?? 0) / totalPerDay * 100).toFixed(0)}% of total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pie chart */}
        <Card>
          <CardHeader><CardTitle>Cost Distribution</CardTitle></CardHeader>
          <EChartsWrapper option={pieOption} height={280} />
        </Card>

        {/* Cost trend */}
        <Card>
          <CardHeader><CardTitle>Daily Cost Trend</CardTitle></CardHeader>
          <TimeSeriesChart
            series={Object.entries(grouped).map(([cat, { total }]) => ({
              name: cat,
              data: generateTimeSeries(total, total * 0.1, 30),
              type: 'area' as const,
              color: categoryColors[cat] ?? '#8B949E',
            }))}
            yAxisLabel="$/day"
            height={280}
          />
        </Card>
      </div>

      {/* Category breakdown */}
      {Object.entries(grouped).map(([category, { items, total }]) => (
        <Card key={category} padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: categoryColors[category] ?? '#8B949E' }} />
              <span className="text-xs font-semibold text-[var(--text-primary)]">{category}</span>
            </div>
            <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">${total.toFixed(1)}/day</span>
          </div>
          <div className="divide-y divide-[var(--border-muted)]">
            {items.map((item) => (
              <div key={item.subcategory} className="px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-tertiary)] transition-colors">
                <span className="text-xs text-[var(--text-secondary)]">{item.subcategory}</span>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'flex items-center gap-0.5 text-[10px]',
                    item.trend > 0 ? 'text-[var(--status-critical)]' : item.trend < 0 ? 'text-[var(--status-healthy)]' : 'text-[var(--text-muted)]',
                  )}>
                    {item.trend > 0 ? <TrendingUp size={10} /> : item.trend < 0 ? <TrendingDown size={10} /> : null}
                    {item.trend !== 0 && `${item.trend > 0 ? '+' : ''}${item.trend}%`}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums w-20 text-right">${item.amount.toFixed(1)}/day</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
