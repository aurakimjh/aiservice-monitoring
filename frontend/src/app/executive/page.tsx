'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard, StatusIndicator } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { getExecutiveSummary, getSLODefinitions, getCostBreakdowns, getProjectServices, getProjectAIServices, getIncidents, generateTimeSeries } from '@/lib/demo-data';
import { formatCost } from '@/lib/utils';
import type { Severity, ExecutiveSummary, SLODefinition, CostBreakdown, Service, AIService, IncidentDetail } from '@/types/monitoring';
import {
  LayoutDashboard,
  Target,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  Bot,
  Server,
} from 'lucide-react';

const SEV_COLOR: Record<Severity, string> = {
  critical: 'text-[var(--status-critical)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};

export default function ExecutiveDashboardPage() {
  const demoFallback = useCallback(() => ({
    summary: getExecutiveSummary(),
    slos: getSLODefinitions(),
    costs: getCostBreakdowns(),
    services: getProjectServices('proj-ai-prod'),
    aiServices: getProjectAIServices('proj-ai-prod'),
    incidents: getIncidents(),
  }), []);
  const { data: rawData, source } = useDataSource('/executive/summary', demoFallback, { refreshInterval: 30_000 });
  const parsed = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData as any : {};
  const summary: ExecutiveSummary = parsed.summary ?? getExecutiveSummary();
  const slos: SLODefinition[] = parsed.slos ?? getSLODefinitions();
  const costs: CostBreakdown[] = parsed.costs ?? getCostBreakdowns();
  const services: Service[] = parsed.services ?? getProjectServices('proj-ai-prod');
  const aiServices: AIService[] = parsed.aiServices ?? getProjectAIServices('proj-ai-prod');
  const incidents: IncidentDetail[] = parsed.incidents ?? getIncidents();

  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  const sloMet = slos.filter((s) => s.status === 'met').length;
  const sloBreached = slos.filter((s) => s.status === 'breached').length;
  const openIncidents = incidents.filter((i) => i.status !== 'resolved').length;

  // Cost by category for donut
  const costByCategory: Record<string, number> = {};
  for (const c of costs) { costByCategory[c.category] = (costByCategory[c.category] ?? 0) + c.amount; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const costDonut = useMemo<any>(() => ({
    animation: false,
    series: [{
      type: 'pie',
      radius: ['55%', '80%'],
      data: Object.entries(costByCategory).map(([name, value]) => ({
        name,
        value: Math.round(value * 10) / 10,
        itemStyle: { color: { 'LLM API': '#F778BA', 'GPU Compute': '#BC8CFF', 'Infrastructure': '#58A6FF', 'Storage': '#3FB950', 'External API': '#D29922' }[name] ?? '#8B949E' },
      })),
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 11 } },
    }],
    tooltip: { trigger: 'item', formatter: '{b}: ${c}/day ({d}%)' },
  }), []);

  // SLO gauge data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sloGauge = useMemo<any>(() => ({
    animation: false,
    series: [{
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 95,
      max: 100,
      pointer: { show: true, length: '60%', width: 4, itemStyle: { color: '#58A6FF' } },
      axisLine: {
        lineStyle: {
          width: 16,
          color: [[0.6, '#F85149'], [0.8, '#D29922'], [1, '#3FB950']],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: true, distance: -24, fontSize: 10, color: '#8B949E' },
      detail: { valueAnimation: true, formatter: '{value}%', fontSize: 20, color: '#E6EDF3', offsetCenter: [0, '65%'] },
      data: [{ value: summary.sloCompliance }],
    }],
  }), [summary.sloCompliance]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Executive Dashboard', icon: <LayoutDashboard size={14} /> },
      ]} />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Executive Dashboard</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard helpId="exec-overall-health" title="Overall Health" value={summary.overallHealth === 'healthy' ? 'Good' : 'Degraded'} status={summary.overallHealth === 'healthy' ? 'healthy' : 'warning'} />
        <KPICard helpId="exec-services" title="Services" value={services.length + aiServices.length} subtitle={`${aiServices.length} AI`} status="healthy" />
        <KPICard helpId="exec-slo-compliance" title="SLO Compliance" value={`${summary.sloCompliance}%`} subtitle={`${sloMet}/${slos.length} met`} status={sloBreached > 0 ? 'critical' : 'healthy'} />
        <KPICard helpId="exec-open-incidents" title="Open Incidents" value={openIncidents} status={openIncidents > 0 ? 'critical' : 'healthy'} />
        <KPICard helpId="exec-mttr" title="MTTR" value={`${summary.mttr}m`} subtitle="mean time to resolve" status="healthy" />
        <KPICard helpId="exec-daily-cost" title="Daily Cost" value={formatCost(totalCost)} trend={{ direction: summary.costTrend > 0 ? 'up' : 'down', value: `${summary.costTrend > 0 ? '+' : ''}${summary.costTrend}%`, positive: summary.costTrend < 0 }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* SLO Gauge */}
        <Card>
          <CardHeader><CardTitle helpId="chart-exec-slo">SLO Compliance</CardTitle></CardHeader>
          <EChartsWrapper option={sloGauge} height={180} />
          <div className="space-y-1.5 mt-2">
            {slos.map((slo) => (
              <div key={slo.id} className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] truncate flex-1">{slo.name}</span>
                <div className="flex items-center gap-2">
                  <span className={cn('tabular-nums font-medium', slo.current >= slo.target ? 'text-[var(--status-healthy)]' : 'text-[var(--status-critical)]')}>
                    {slo.current}%
                  </span>
                  <div className="w-12 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', slo.errorBudgetRemaining > 50 ? 'bg-[var(--status-healthy)]' : slo.errorBudgetRemaining > 20 ? 'bg-[var(--status-warning)]' : 'bg-[var(--status-critical)]')} style={{ width: `${slo.errorBudgetRemaining}%` }} />
                  </div>
                </div>
              </div>
            ))}
            <Link href="/slo" className="block text-[10px] text-[var(--accent-primary)] hover:underline mt-1">View all SLOs &rarr;</Link>
          </div>
        </Card>

        {/* Cost Donut */}
        <Card>
          <CardHeader><CardTitle helpId="chart-exec-cost-breakdown">Cost Breakdown</CardTitle></CardHeader>
          <EChartsWrapper option={costDonut} height={180} />
          <div className="text-center mt-1">
            <span className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{formatCost(totalCost)}</span>
            <span className="text-xs text-[var(--text-muted)]"> /day</span>
            <span className="text-xs text-[var(--text-muted)] ml-2">({formatCost(totalCost * 30)}/mo)</span>
          </div>
          <Link href="/costs" className="block text-[10px] text-[var(--accent-primary)] hover:underline mt-2 text-center">View cost details &rarr;</Link>
        </Card>

        {/* Top Issues */}
        <Card>
          <CardHeader><CardTitle helpId="table-exec-top-issues">Top Issues</CardTitle></CardHeader>
          <div className="space-y-2">
            {summary.topIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)]">
                <AlertTriangle size={13} className={cn('mt-0.5 shrink-0', SEV_COLOR[issue.severity])} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--text-primary)]">{issue.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                    <span className={cn('font-medium', SEV_COLOR[issue.severity])}>{issue.severity}</span>
                    <span>{issue.age} ago</span>
                  </div>
                </div>
              </div>
            ))}
            {openIncidents > 0 && (
              <Link href="/alerts" className="block text-[10px] text-[var(--accent-primary)] hover:underline">
                View {openIncidents} open incident{openIncidents > 1 && 's'} &rarr;
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle helpId="chart-exec-health-trend">Service Health Trend</CardTitle></CardHeader>
          <TimeSeriesChart
            series={[
              { name: 'Healthy', data: generateTimeSeries(7, 1, 30), type: 'area', color: '#3FB950' },
              { name: 'Warning', data: generateTimeSeries(1, 0.5, 30), type: 'area', color: '#D29922' },
              { name: 'Critical', data: generateTimeSeries(0.3, 0.3, 30), type: 'area', color: '#F85149' },
            ]}
            yAxisLabel="services"
            height={200}
          />
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-exec-cost-trend">Cost Trend (30 days)</CardTitle></CardHeader>
          <TimeSeriesChart
            series={[
              { name: 'Total Cost', data: generateTimeSeries(totalCost, totalCost * 0.08, 30), type: 'area', color: '#58A6FF' },
            ]}
            yAxisLabel="$/day"
            height={200}
          />
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Services', href: '/services', icon: <Activity size={16} />, count: services.length },
          { label: 'AI Services', href: '/ai', icon: <Bot size={16} />, count: aiServices.length },
          { label: 'SLO Management', href: '/slo', icon: <Target size={16} />, count: slos.length },
          { label: 'Cost Analysis', href: '/costs', icon: <DollarSign size={16} />, count: costs.length },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="hover:border-[var(--accent-primary)] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-[var(--accent-primary)]">{link.icon}</span>
                <div>
                  <div className="text-xs font-medium text-[var(--text-primary)]">{link.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{link.count} items</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
