'use client';

import { useCallback } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { AISubNav } from '@/components/ai';
import { useDataSource } from '@/hooks/use-data-source';
import { generateTimeSeries } from '@/lib/demo-data';
import { Bot, Brain, Zap, DollarSign, Shield } from 'lucide-react';

interface CostSummaryItem {
  model: string; provider: string; total_calls: number;
  total_input_tokens: number; total_output_tokens: number;
  total_cost_usd: number; avg_latency_ms: number;
}
interface CostSummary { items: CostSummaryItem[]; total_cost: number; total_tokens: number }

export default function AIOverviewPage() {
  const demoCost = useCallback((): CostSummary => ({ items: [], total_cost: 0, total_tokens: 0 }), []);
  const { data: costData, source } = useDataSource<CostSummary>(
    '/genai/cost-summary',
    demoCost,
    { refreshInterval: 30_000 },
  );

  const demoSpans = useCallback(() => ({ items: [], total: 0 }), []);
  const { data: spanData } = useDataSource<{ items: unknown[]; total: number }>(
    '/genai/spans?limit=200',
    demoSpans,
    { refreshInterval: 30_000, transform: (raw) => raw as { items: unknown[]; total: number } },
  );

  const cost = costData ?? { items: [], total_cost: 0, total_tokens: 0 };
  const totalCalls = cost.items.reduce((s, i) => s + i.total_calls, 0);
  const totalTokens = cost.total_tokens;
  const totalCostUSD = cost.total_cost;
  const avgLatency = cost.items.length > 0
    ? Math.round(cost.items.reduce((s, i) => s + i.avg_latency_ms, 0) / cost.items.length)
    : 0;
  const models = cost.items.map((i) => i.model).filter(Boolean);

  // Model distribution pie
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelPieOption: any = {
    animation: false,
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['40%', '70%'],
      data: cost.items.length > 0
        ? cost.items.map((i, idx) => ({
            name: i.model || i.provider,
            value: i.total_calls,
            itemStyle: { color: ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'][idx % 6] },
          }))
        : [{ name: 'No data', value: 1, itemStyle: { color: '#30363D' } }],
      label: { show: true, fontSize: 10, color: '#8B949E' },
    }],
  };

  // Cost trend (simulated from current value)
  const costTrendData = generateTimeSeries(totalCostUSD > 0 ? totalCostUSD / 24 : 0.5, 0.2, 60);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'AI Overview', icon: <Brain size={14} /> },
      ]} />
      <AISubNav />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Overview Dashboard</h1>
        <DataSourceBadge source={source} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard helpId="ai-services-count" title="AI Services" value={models.length || '-'} subtitle={`${totalCalls} total calls`} status="healthy" />
        <KPICard helpId="ai-total-tokens" title="Total Tokens" value={totalTokens > 0 ? totalTokens.toLocaleString() : '-'} status="healthy" />
        <KPICard
          helpId="ai-total-cost"
          title="Total Cost"
          value={totalCostUSD > 0 ? `$${totalCostUSD.toFixed(2)}` : '$0.00'}
          subtitle={totalCostUSD === 0 ? 'Local LLM' : undefined}
          status={totalCostUSD > 100 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="ai-avg-latency"
          title="Avg Latency"
          value={avgLatency || '-'}
          unit="ms"
          status={avgLatency > 2000 ? 'warning' : 'healthy'}
        />
        <KPICard helpId="ai-models-count" title="Models" value={models.length || '-'} subtitle={models.join(', ') || 'None'} status="healthy" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle helpId="chart-model-distribution">Model Distribution (by calls)</CardTitle></CardHeader>
          <EChartsWrapper option={modelPieOption} height={220} />
        </Card>
        <Card>
          <CardHeader><CardTitle helpId="chart-cost-trend">Cost Trend ($/h)</CardTitle></CardHeader>
          <TimeSeriesChart
            series={[{ name: 'Cost', data: costTrendData, type: 'area', color: '#D29922' }]}
            yAxisLabel="$/h"
            height={220}
          />
        </Card>
      </div>

      {/* Model Breakdown Table */}
      <Card padding="none">
        <div className="px-4 py-3 border-b border-[var(--border-default)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Model Breakdown</span>
        </div>
        {cost.items.length === 0 ? (
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">
            No LLM calls recorded yet. Instrument your AI services with OTel GenAI conventions.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2.5 font-medium">Provider / Model</th>
                <th className="px-4 py-2.5 font-medium text-right">Calls</th>
                <th className="px-4 py-2.5 font-medium text-right">Input Tokens</th>
                <th className="px-4 py-2.5 font-medium text-right">Output Tokens</th>
                <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {cost.items.map((item) => (
                <tr key={`${item.provider}-${item.model}`} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)]">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-[var(--text-primary)]">{item.model}</span>
                    <span className="text-[var(--text-muted)] ml-1">({item.provider})</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{item.total_calls}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{item.total_input_tokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{item.total_output_tokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-primary)] font-medium">${item.total_cost_usd.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">{Math.round(item.avg_latency_ms)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
