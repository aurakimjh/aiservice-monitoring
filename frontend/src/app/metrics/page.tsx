'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, SearchInput, Badge, Button, DataSourceBadge } from '@/components/ui';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { METRIC_CATALOG, executeMetricQuery, generateTimeSeries } from '@/lib/demo-data';
import { useDataSource, type DataSource } from '@/hooks/use-data-source';
import { formatDuration } from '@/lib/utils';
import type { MetricDefinition, MetricType } from '@/types/monitoring';
import { useUIStore } from '@/stores/ui-store';
import {
  BarChart3,
  Search,
  Play,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Cpu,
  Globe,
  Brain,
  Database,
  Gpu,
  Settings2,
  LineChart,
  AreaChart,
  BarChart,
} from 'lucide-react';

// ── Constants ──

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  system: { label: 'System', icon: <Cpu size={13} />, color: '#58A6FF' },
  http: { label: 'HTTP', icon: <Globe size={13} />, color: '#3FB950' },
  llm: { label: 'LLM', icon: <Brain size={13} />, color: '#F778BA' },
  vectordb: { label: 'VectorDB', icon: <Database size={13} />, color: '#D29922' },
  gpu: { label: 'GPU', icon: <Gpu size={13} />, color: '#BC8CFF' },
  custom: { label: 'Custom', icon: <Settings2 size={13} />, color: '#8B949E' },
};

const TYPE_BADGES: Record<MetricType, string> = {
  counter: 'bg-[#1F6FEB]/20 text-[#58A6FF]',
  gauge: 'bg-[#238636]/20 text-[#3FB950]',
  histogram: 'bg-[#9E6A03]/20 text-[#D29922]',
  summary: 'bg-[#8B5CF6]/20 text-[#BC8CFF]',
};

const CHART_COLORS = ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA', '#79C0FF', '#56D364'];

const VIEW_TABS = [
  { id: 'explore', label: 'Explore', icon: <LineChart size={13} /> },
  { id: 'catalog', label: 'Catalog', icon: <BarChart3 size={13} /> },
];

const CHART_TYPE_OPTIONS = [
  { id: 'line', label: 'Line', icon: <LineChart size={12} /> },
  { id: 'area', label: 'Area', icon: <AreaChart size={12} /> },
  { id: 'bar', label: 'Bar', icon: <BarChart size={12} /> },
];

interface QueryPanel {
  id: string;
  metric: string;
  query: string;
  chartType: 'line' | 'area' | 'bar';
}

// ── Metric query helper (v2 API — AITOP Metric Engine) ──

import { API_V2_BASE } from '@/hooks/use-data-source';

async function queryMetrics(
  promql: string,
  points: number,
): Promise<{ data: [number, number][]; label: string }[] | null> {
  try {
    const end = Date.now();
    const start = end - points * 60_000;
    const step = '60s';
    const url = `${API_V2_BASE}/api/v2/metrics/promql?query=${encodeURIComponent(promql)}&from=${start}&to=${end}&step=${step}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.results?.length) return null;

    return json.results.map((r: { series: { name: string; labels: Record<string, string> }; samples: { t: string; v: number }[] }) => {
      const label = Object.entries(r.series.labels ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || r.series.name;
      return {
        label,
        data: r.samples.map((s: { t: string; v: number }) => [new Date(s.t).getTime(), s.v] as [number, number]),
      };
    });
  } catch {
    return null;
  }
}

// ── Page ──

export default function MetricsPage() {
  const mode = useUIStore((s) => s.dataSourceMode);
  const demoPromStatus = useCallback(() => ({ status: 'demo' }), []);
  const { data: promStatus, source: promSource } = useDataSource<{ status: string }>(
    '/api/v2/metrics/_stats',
    demoPromStatus,
    { refreshInterval: 60_000, transform: () => ({ status: 'ok' }) },
  );

  const [viewMode, setViewMode] = useState('explore');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  // Query panels
  const [panels, setPanels] = useState<QueryPanel[]>([
    { id: 'p1', metric: 'http_request_duration_seconds', query: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))', chartType: 'line' },
  ]);

  const addPanel = (metricName?: string) => {
    const metric = metricName ?? 'http_requests_total';
    const def = METRIC_CATALOG.find((m) => m.name === metric);
    const query = def?.type === 'counter' ? `rate(${metric}[5m])` :
                  def?.type === 'histogram' ? `histogram_quantile(0.95, rate(${metric}_bucket[5m]))` :
                  metric;
    setPanels((prev) => [...prev, {
      id: `p${Date.now()}`,
      metric,
      query,
      chartType: 'line',
    }]);
    setViewMode('explore');
  };

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePanel = (id: string, updates: Partial<QueryPanel>) => {
    setPanels((prev) => prev.map((p) => p.id === id ? { ...p, ...updates } : p));
  };

  // Catalog filtering
  const filteredCatalog = useMemo(() => {
    return METRIC_CATALOG.filter((m) => {
      if (catalogCategory !== 'all' && m.category !== catalogCategory) return false;
      if (catalogSearch) {
        const q = catalogSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [catalogSearch, catalogCategory]);

  // Group catalog by category
  const groupedCatalog = useMemo(() => {
    const groups: Record<string, MetricDefinition[]> = {};
    for (const m of filteredCatalog) {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    }
    return groups;
  }, [filteredCatalog]);

  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Metrics', icon: <BarChart3 size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Metrics Explorer</h1>
          <DataSourceBadge source={promSource} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">{METRIC_CATALOG.length} metrics available</span>
          <Tabs tabs={VIEW_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />
        </div>
      </div>

      {/* ── Explore View ── */}
      {viewMode === 'explore' && (
        <div className="space-y-3">
          {panels.map((panel) => (
            <MetricPanel
              key={panel.id}
              panel={panel}
              onUpdate={(updates) => updatePanel(panel.id, updates)}
              onRemove={() => removePanel(panel.id)}
            />
          ))}

          <button
            onClick={() => addPanel()}
            className="w-full py-3 border-2 border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Add Query Panel
          </button>

          {/* Quick metric suggestions */}
          <Card>
            <CardHeader><CardTitle>Quick Add</CardTitle></CardHeader>
            <div className="flex flex-wrap gap-2">
              {[
                'http_requests_total',
                'http_request_duration_seconds',
                'llm_ttft_seconds',
                'llm_tokens_per_second',
                'gpu_vram_used_bytes',
                'gpu_temperature_celsius',
                'node_cpu_seconds_total',
                'vectordb_query_duration_seconds',
              ].map((name) => {
                const def = METRIC_CATALOG.find((m) => m.name === name);
                return (
                  <button
                    key={name}
                    onClick={() => addPanel(name)}
                    className="px-2.5 py-1.5 text-xs rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors flex items-center gap-1.5"
                  >
                    {def && CATEGORY_CONFIG[def.category]?.icon}
                    {name}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Catalog View ── */}
      {viewMode === 'catalog' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput
              placeholder="Search metrics..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-64"
            />
            <button
              onClick={() => setCatalogCategory('all')}
              className={cn(
                'px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors',
                catalogCategory === 'all'
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
              )}
            >
              All ({METRIC_CATALOG.length})
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const count = METRIC_CATALOG.filter((m) => m.category === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setCatalogCategory(key)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-colors flex items-center gap-1',
                    catalogCategory === key
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  {config.icon}
                  {config.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Grouped metric list */}
          {Object.entries(groupedCatalog).map(([category, metrics]) => (
            <Card key={category} padding="none">
              <div className="px-4 py-2.5 border-b border-[var(--border-default)] flex items-center gap-2">
                <span style={{ color: CATEGORY_CONFIG[category]?.color }}>
                  {CATEGORY_CONFIG[category]?.icon}
                </span>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {CATEGORY_CONFIG[category]?.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">({metrics.length})</span>
              </div>
              <div className="divide-y divide-[var(--border-muted)]">
                {metrics.map((m) => {
                  const isExpanded = expandedMetric === m.name;
                  return (
                    <div key={m.name}>
                      <div
                        onClick={() => setExpandedMetric(isExpanded ? null : m.name)}
                        className="px-4 py-2.5 hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors flex items-center gap-3"
                      >
                        <ChevronRight
                          size={12}
                          className={cn('text-[var(--text-muted)] transition-transform shrink-0', isExpanded && 'rotate-90')}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-[var(--text-primary)]">{m.name}</span>
                            <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', TYPE_BADGES[m.type])}>
                              {m.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.description}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); addPanel(m.name); }}
                          className="shrink-0 px-2 py-1 text-[10px] font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 rounded transition-colors"
                        >
                          + Explore
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-3 ml-7 space-y-2">
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-[var(--text-muted)]">Unit: <strong className="text-[var(--text-primary)]">{m.unit}</strong></span>
                            <span className="text-[var(--text-muted)]">Type: <strong className="text-[var(--text-primary)]">{m.type}</strong></span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-[var(--text-muted)]">Labels:</span>
                            {m.labels.map((label) => (
                              <span key={label} className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[10px] font-mono text-[var(--text-secondary)]">
                                {label}
                              </span>
                            ))}
                          </div>
                          {/* Mini preview chart */}
                          <MiniPreview metricName={m.name} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {filteredCatalog.length === 0 && (
            <Card>
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">No metrics match your search.</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Metric Panel Component ──

function MetricPanel({
  panel,
  onUpdate,
  onRemove,
}: {
  panel: QueryPanel;
  onUpdate: (updates: Partial<QueryPanel>) => void;
  onRemove: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [queryInput, setQueryInput] = useState(panel.query);

  const mode = useUIStore((s) => s.dataSourceMode);
  const metric = METRIC_CATALOG.find((m) => m.name === panel.metric);
  const [liveData, setLiveData] = useState<{ data: [number, number][]; label: string }[] | null>(null);
  const [panelSource, setPanelSource] = useState<DataSource>('demo');

  // Try Prometheus query, fallback to demo
  useEffect(() => {
    if (mode === 'demo') { setPanelSource('demo'); return; }
    let cancelled = false;
    queryMetrics(panel.query, 60).then((result) => {
      if (cancelled) return;
      if (result && result.length > 0) { setLiveData(result); setPanelSource('live'); }
      else { setLiveData(null); setPanelSource('demo'); }
    });
    return () => { cancelled = true; };
  }, [panel.query, mode]);

  const seriesData = liveData ?? executeMetricQuery(panel.metric, 60);

  const handleSubmitQuery = () => {
    onUpdate({ query: queryInput });
    setIsEditing(false);
  };

  const series = useMemo(() => {
    return seriesData.map((s, i) => ({
      name: s.label,
      data: s.data,
      color: CHART_COLORS[i % CHART_COLORS.length],
      type: panel.chartType === 'bar' ? 'bar' as const : panel.chartType === 'area' ? 'area' as const : 'line' as const,
    }));
  }, [seriesData, panel.chartType]);

  return (
    <Card>
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {metric && (
            <span style={{ color: CATEGORY_CONFIG[metric.category]?.color }}>
              {CATEGORY_CONFIG[metric.category]?.icon}
            </span>
          )}
          <span className="font-mono text-xs font-medium text-[var(--text-primary)] truncate">{panel.metric}</span>
          {metric && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0', TYPE_BADGES[metric.type])}>
              {metric.type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {CHART_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onUpdate({ chartType: opt.id as QueryPanel['chartType'] })}
              className={cn(
                'p-1 rounded transition-colors',
                panel.chartType === opt.id
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              )}
            >
              {opt.icon}
            </button>
          ))}
          <button onClick={onRemove} className="p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)] rounded transition-colors ml-1">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Query editor */}
      <div className="mb-3">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitQuery()}
              className="flex-1 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-emphasis)] rounded-[var(--radius-sm)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={handleSubmitQuery}>
              <Play size={11} /> Run
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setIsEditing(false); setQueryInput(panel.query); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full text-left px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] transition-colors truncate"
          >
            {panel.query}
          </button>
        )}
      </div>

      {/* Metric selector */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {METRIC_CATALOG.filter((m) => m.category === metric?.category).slice(0, 6).map((m) => (
          <button
            key={m.name}
            onClick={() => {
              const query = m.type === 'counter' ? `rate(${m.name}[5m])` :
                            m.type === 'histogram' ? `histogram_quantile(0.95, rate(${m.name}_bucket[5m]))` :
                            m.name;
              onUpdate({ metric: m.name, query });
              setQueryInput(query);
            }}
            className={cn(
              'px-2 py-0.5 text-[10px] font-mono rounded transition-colors',
              m.name === panel.metric
                ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {m.name.split('_').slice(-2).join('_')}
          </button>
        ))}
      </div>

      {/* Chart */}
      {series.length > 0 ? (
        <TimeSeriesChart
          series={series}
          yAxisLabel={metric?.unit}
          height={220}
        />
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-muted)]">
          <div className="text-center space-y-2">
            <Search size={24} className="mx-auto opacity-30" />
            <p>No data for this metric</p>
          </div>
        </div>
      )}

      {/* Legend / info */}
      {metric && (
        <div className="mt-2 pt-2 border-t border-[var(--border-muted)] text-[10px] text-[var(--text-muted)]">
          {metric.description} &middot; Unit: {metric.unit} &middot; Labels: {metric.labels.join(', ')}
        </div>
      )}
    </Card>
  );
}

// ── Mini Preview (catalog) ──

function MiniPreview({ metricName }: { metricName: string }) {
  const seriesData = useMemo(() => executeMetricQuery(metricName, 30), [metricName]);

  const series = useMemo(() => {
    return seriesData.slice(0, 2).map((s, i) => ({
      name: s.label,
      data: s.data,
      color: CHART_COLORS[i % CHART_COLORS.length],
      type: 'line' as const,
    }));
  }, [seriesData]);

  if (series.length === 0) return null;

  return (
    <div className="mt-1">
      <TimeSeriesChart series={series} height={100} />
    </div>
  );
}
