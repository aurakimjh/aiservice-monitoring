'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AISubNav } from '@/components/ai';
import { Breadcrumb, Card, CardHeader, CardTitle, Tabs, Badge, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { EChartsWrapper } from '@/components/charts';
import { getModelCostProfiles, getCacheAnalysis, getCostRecommendations, getBudgetAlerts } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { CostRecommendationCard } from '@/components/ai/cost-recommendation-card';
import { Bot, DollarSign, TrendingDown, Database, Bell } from 'lucide-react';

const TABS = [
  { id: 'models', label: 'Models' },
  { id: 'cache', label: 'Cache' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'budget', label: 'Budget' },
];

interface CostSummaryItem {
  model: string; provider: string; total_calls: number;
  total_input_tokens: number; total_output_tokens: number;
  total_cost_usd: number; avg_latency_ms: number;
}

export default function AICostOptimizationPage() {
  const [activeTab, setActiveTab] = useState('models');

  // Live cost summary from API
  const demoCostSummary = useCallback(() => ({ items: [] as CostSummaryItem[], total_cost: 0, total_tokens: 0 }), []);
  const { data: costData, source } = useDataSource(
    '/genai/cost-summary',
    demoCostSummary,
    { refreshInterval: 30_000 },
  );
  const liveSummary = (costData as { items?: CostSummaryItem[]; total_cost?: number; total_tokens?: number }) ?? {};
  const liveCostItems = liveSummary.items ?? [];
  const liveTotalCost = liveSummary.total_cost ?? 0;
  const liveTotalTokens = liveSummary.total_tokens ?? 0;

  const models = useMemo(() => getModelCostProfiles(), []);
  const cache = useMemo(() => getCacheAnalysis(), []);
  const recommendations = useMemo(() => getCostRecommendations(), []);
  const budgetAlerts = useMemo(() => getBudgetAlerts(), []);

  const totalCost = liveTotalCost > 0 ? liveTotalCost : models.reduce((s, m) => s + m.dailyCost, 0);
  const totalSavings = recommendations.reduce((s, r) => s + r.estimatedSaving, 0);
  const activeBudgetAlerts = budgetAlerts.filter((b) => b.enabled).length;

  // Scatter chart: Cost vs Quality
  const scatterOption = useMemo(() => {
    const maxTokens = Math.max(...models.map((m) => m.dailyTokens));
    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: unknown) => {
          const p = params as { data: number[]; dataIndex: number };
          const m = models[p.dataIndex];
          return `<strong>${m.model}</strong><br/>Cost: $${m.dailyCost.toFixed(2)}/day<br/>Quality: ${(m.qualityScore * 100).toFixed(0)}%<br/>Tokens: ${(m.dailyTokens / 1000).toFixed(0)}K/day`;
        },
      },
      xAxis: {
        name: 'Daily Cost ($)',
        nameLocation: 'middle' as const,
        nameGap: 28,
        type: 'value' as const,
      },
      yAxis: {
        name: 'Quality Score',
        nameLocation: 'middle' as const,
        nameGap: 36,
        type: 'value' as const,
        min: 0.6,
        max: 1.0,
      },
      series: [
        {
          type: 'scatter' as const,
          data: models.map((m) => [m.dailyCost, m.qualityScore]),
          symbolSize: models.map((m) => Math.max(12, (m.dailyTokens / maxTokens) * 50)),
          itemStyle: { color: '#58A6FF', opacity: 0.8 },
          label: {
            show: true,
            formatter: (params: unknown) => models[(params as { dataIndex: number }).dataIndex].model,
            position: 'top' as const,
            fontSize: 10,
            color: '#8B949E',
          },
        },
      ],
    };
  }, [models]);

  // Donut chart: Cache hits vs misses
  const cacheDonutOption = useMemo(() => ({
    tooltip: { trigger: 'item' as const },
    legend: { bottom: 0, textStyle: { color: '#8B949E', fontSize: 11 } },
    series: [
      {
        type: 'pie' as const,
        radius: ['50%', '75%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center' as const,
          formatter: `{a|${(cache.hitRate * 100).toFixed(0)}%}\n{b|Hit Rate}`,
          rich: {
            a: { fontSize: 22, fontWeight: 'bold' as const, color: '#E6EDF3', lineHeight: 30 },
            b: { fontSize: 11, color: '#8B949E', lineHeight: 18 },
          },
        },
        data: [
          { value: cache.cacheHits, name: 'Hits', itemStyle: { color: '#3FB950' } },
          { value: cache.cacheMisses, name: 'Misses', itemStyle: { color: '#484F58' } },
        ],
      },
    ],
  }), [cache]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'Cost Optimization', icon: <DollarSign size={14} /> },
      ]} />

      <AISubNav />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">AI Cost Optimization</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          helpId="ai-total-daily-cost"
          title="Total AI Cost"
          value={`$${totalCost.toFixed(2)}`}
          subtitle="per day"
          status="healthy"
          sparkData={[42, 44, 46, 45, 48, 47, 49, 50, totalCost]}
        />
        <KPICard
          helpId="ai-potential-savings"
          title="Potential Savings"
          value={`$${totalSavings.toFixed(2)}`}
          subtitle="per day"
          trend={{ direction: 'down', value: `${((totalSavings / totalCost) * 100).toFixed(0)}%`, positive: true }}
        />
        <KPICard
          helpId="ai-cache-hit-rate"
          title="Cache Hit Rate"
          value={`${(cache.hitRate * 100).toFixed(0)}`}
          unit="%"
          sparkData={[30, 32, 34, 33, 36, 35, 37, 38]}
          status="warning"
        />
        <KPICard
          helpId="ai-budget-alerts"
          title="Active Budget Alerts"
          value={activeBudgetAlerts}
          subtitle={`of ${budgetAlerts.length} total`}
          status={activeBudgetAlerts > 2 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                    <th className="text-left px-4 py-2 font-medium">Model</th>
                    <th className="text-left px-4 py-2 font-medium">Provider</th>
                    <th className="text-right px-4 py-2 font-medium">Input $/1K</th>
                    <th className="text-right px-4 py-2 font-medium">Output $/1K</th>
                    <th className="text-right px-4 py-2 font-medium">Latency</th>
                    <th className="text-right px-4 py-2 font-medium">Quality</th>
                    <th className="text-right px-4 py-2 font-medium">Daily Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Daily Cost</th>
                    <th className="text-right px-4 py-2 font-medium">Efficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr
                      key={m.model}
                      className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <td className="px-4 py-2 font-medium text-[var(--text-primary)]">{m.model}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">
                        <Badge>{m.provider}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text-primary)] tabular-nums">${m.inputCostPer1k.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-primary)] tabular-nums">${m.outputCostPer1k.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)] tabular-nums">{m.avgLatencyMs}ms</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className={cn(
                          'font-medium',
                          m.qualityScore >= 0.85 ? 'text-[var(--status-healthy)]' :
                          m.qualityScore >= 0.75 ? 'text-[var(--status-warning)]' :
                          'text-[var(--text-secondary)]'
                        )}>
                          {(m.qualityScore * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text-secondary)] tabular-nums">
                        {(m.dailyTokens / 1_000_000).toFixed(1)}M
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--text-primary)] font-medium tabular-nums">
                        ${m.dailyCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className={cn(
                          'font-medium',
                          m.costEfficiency >= 1 ? 'text-[var(--status-healthy)]' :
                          m.costEfficiency >= 0.1 ? 'text-[var(--status-warning)]' :
                          'text-[var(--text-secondary)]'
                        )}>
                          {m.costEfficiency.toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost vs Quality (bubble size = daily tokens)</CardTitle>
            </CardHeader>
            <EChartsWrapper option={scatterOption} height={320} />
          </Card>
        </div>
      )}

      {/* Cache Tab */}
      {activeTab === 'cache' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <div className="text-xs text-[var(--text-secondary)] mb-1">Total Requests</div>
              <div className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
                {cache.totalRequests.toLocaleString()}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-secondary)] mb-1">Hits</div>
              <div className="text-xl font-semibold text-[var(--status-healthy)] tabular-nums">
                {cache.cacheHits.toLocaleString()}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-secondary)] mb-1">Hit Rate</div>
              <div className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
                {(cache.hitRate * 100).toFixed(1)}%
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-secondary)] mb-1">Savings</div>
              <div className="text-xl font-semibold text-[var(--status-healthy)] tabular-nums">
                ${cache.estimatedSavings.toFixed(2)}/day
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Cache Hit Distribution</CardTitle>
              </CardHeader>
              <EChartsWrapper option={cacheDonutOption} height={280} />
            </Card>
            <Card className="border-l-2 border-l-[var(--status-info)]">
              <CardHeader>
                <CardTitle>Potential Savings</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Current savings from cache</span>
                  <span className="text-[var(--text-primary)] font-medium">${cache.estimatedSavings.toFixed(2)}/day</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Potential with semantic caching</span>
                  <span className="text-[var(--status-healthy)] font-medium">${cache.potentialSavings.toFixed(2)}/day</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Additional cacheable patterns</span>
                  <span className="text-[var(--text-primary)] font-medium">{cache.topCacheablePatternsCount}</span>
                </div>
                <div className="border-t border-[var(--border-default)] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)] font-medium">Unrealized savings</span>
                    <span className="text-[var(--status-healthy)] font-semibold text-base">
                      +${(cache.potentialSavings - cache.estimatedSavings).toFixed(2)}/day
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          <Card className="bg-[var(--bg-tertiary)]">
            <div className="flex items-center gap-3">
              <TrendingDown size={18} className="text-[var(--status-healthy)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Total Potential Savings: <span className="text-[var(--status-healthy)]">${totalSavings.toFixed(2)}/day</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {recommendations.filter((r) => !r.implemented).length} actionable recommendations &middot;{' '}
                  {recommendations.filter((r) => r.implemented).length} implemented
                </div>
              </div>
            </div>
          </Card>
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <CostRecommendationCard key={rec.id} recommendation={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-right px-4 py-2 font-medium">Threshold</th>
                  <th className="text-right px-4 py-2 font-medium">Current</th>
                  <th className="text-left px-4 py-2 font-medium">Period</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium min-w-[160px]">Usage</th>
                </tr>
              </thead>
              <tbody>
                {budgetAlerts.map((b) => {
                  const pct = Math.min((b.currentSpend / b.threshold) * 100, 100);
                  const barColor =
                    pct >= 90 ? 'var(--status-critical)' :
                    pct >= 70 ? 'var(--status-warning)' :
                    'var(--status-healthy)';

                  return (
                    <tr
                      key={b.id}
                      className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                        <div className="flex items-center gap-2">
                          <Bell size={12} className="text-[var(--text-muted)]" />
                          {b.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-primary)] tabular-nums">
                        ${b.threshold.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-primary)] font-medium tabular-nums">
                        ${b.currentSpend.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] capitalize">{b.period}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant="status"
                          status={b.enabled ? 'healthy' : 'offline'}
                        >
                          {b.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] tabular-nums w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
