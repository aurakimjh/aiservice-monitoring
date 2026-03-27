'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, Tabs, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { useDashboardStore } from '@/stores/dashboard-store';
import { getDashboardTemplates, METRIC_CATALOG, executeMetricQuery } from '@/lib/demo-data';
import { useUIStore } from '@/stores/ui-store';
import type { WidgetConfig, WidgetType, WidgetSize, DashboardConfig, WidgetViewMode } from '@/types/monitoring';
import {
  LayoutDashboard, Plus, X, GripVertical, Settings2, Save, Download, Upload,
  Copy, BarChart3, LineChart, PieChart, Type, Hash, Table2, Trash2,
  Check, Lock, Unlock, FolderPlus, Activity, Eye, Layers,
} from 'lucide-react';

// ── Constants ──

const WIDGET_TYPES: { type: WidgetType; label: string; icon: React.ReactNode }[] = [
  { type: 'kpi', label: 'KPI Card', icon: <Hash size={14} /> },
  { type: 'timeseries', label: 'Time Series', icon: <LineChart size={14} /> },
  { type: 'bar', label: 'Bar Chart', icon: <BarChart3 size={14} /> },
  { type: 'pie', label: 'Pie Chart', icon: <PieChart size={14} /> },
  { type: 'gauge', label: 'Gauge', icon: <Activity size={14} /> },
  { type: 'table', label: 'Table', icon: <Table2 size={14} /> },
  { type: 'text', label: 'Text / Note', icon: <Type size={14} /> },
];

const SIZE_OPTIONS: { value: WidgetSize; label: string }[] = [
  { value: '1x1', label: '1x1' },
  { value: '2x1', label: '2x1 wide' },
  { value: '1x2', label: '1x2 tall' },
  { value: '2x2', label: '2x2 large' },
];

const CHART_COLORS = ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'];

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1')
  : 'http://localhost:8080/api/v1';

// ── Prometheus query helper ──

async function queryPrometheus(promql: string, points: number) {
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - points * 60;
    const url = `${API_BASE}/proxy/prometheus/query_range?query=${encodeURIComponent(promql)}&start=${start}&end=${end}&step=60`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 'success' || !json.data?.result?.length) return null;
    return json.data.result.map((r: { metric: Record<string, string>; values: [number, string][] }) => ({
      label: Object.entries(r.metric).map(([k, v]) => `${k}=${v}`).join(', ') || promql,
      data: r.values.map(([ts, val]: [number, string]) => [ts * 1000, parseFloat(val)] as [number, number]),
    }));
  } catch { return null; }
}

// ── Page ──

export default function DashboardBuilderPage() {
  const store = useDashboardStore();
  const mode = useUIStore((s) => s.dataSourceMode);

  // Init store on mount
  useEffect(() => { store.init(); }, []);

  const dashboards = store.dashboards;
  const activeDb = dashboards.find((d) => d.id === store.activeDashboardId) ?? dashboards[0];
  const templates = useMemo(() => getDashboardTemplates(), []);

  const [viewMode, setViewMode] = useState<'builder' | 'templates' | 'list'>('builder');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag handlers
  const handleDragStart = (id: string) => { dragItemRef.current = id; };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragItemRef.current && dragItemRef.current !== id) setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (dragItemRef.current) store.reorderWidgets(dragItemRef.current, targetId);
    dragItemRef.current = null;
  };
  const handleDragEnd = () => { dragItemRef.current = null; setDragOverId(null); };

  // Export
  const handleExport = () => {
    if (!activeDb) return;
    const blob = new Blob([JSON.stringify(activeDb, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDb.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const config = JSON.parse(reader.result as string) as DashboardConfig;
        if (config.widgets?.length) {
          store.importDashboard(config);
          setViewMode('builder');
        }
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const editWidget = store.editingWidgetId && activeDb
    ? activeDb.widgets.find((w) => w.id === store.editingWidgetId)
    : null;

  const VIEW_TABS = [
    { id: 'builder', label: 'Builder', icon: <LayoutDashboard size={13} /> },
    { id: 'list', label: `Dashboards (${dashboards.length})`, icon: <Layers size={13} /> },
    { id: 'templates', label: 'Templates', icon: <Copy size={13} /> },
  ];

  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Dashboards', icon: <LayoutDashboard size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Dashboard Builder</h1>
            {activeDb && viewMode === 'builder' && (
              <Badge>{store.editMode ? 'Editing' : 'View Only'}</Badge>
            )}
          </div>
          {viewMode === 'builder' && activeDb && (
            <input
              type="text"
              value={activeDb.name}
              onChange={(e) => store.renameDashboard(activeDb.id, e.target.value)}
              className="text-xs text-[var(--text-muted)] bg-transparent border-none outline-none hover:text-[var(--text-secondary)] focus:text-[var(--text-primary)] mt-0.5"
              readOnly={!store.editMode}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'builder' && activeDb && (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={() => store.setEditMode(!store.editMode)}
              >
                {store.editMode ? <><Lock size={12} /> Lock</> : <><Unlock size={12} /> Edit</>}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport}><Download size={12} /> Export</Button>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={12} /> Import
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            </>
          )}
          <Tabs tabs={VIEW_TABS} activeTab={viewMode} onChange={(v) => setViewMode(v as typeof viewMode)} variant="pill" />
        </div>
      </div>

      {/* ── Builder View ── */}
      {viewMode === 'builder' && activeDb && (
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-4 gap-3 auto-rows-[140px]">
              {activeDb.widgets.map((widget) => {
                const colSpan = widget.size.startsWith('2') ? 'col-span-2' : 'col-span-1';
                const rowSpan = widget.size.endsWith('2') ? 'row-span-2' : 'row-span-1';
                return (
                  <div
                    key={widget.id}
                    draggable={store.editMode}
                    onDragStart={() => handleDragStart(widget.id)}
                    onDragOver={(e) => handleDragOver(e, widget.id)}
                    onDrop={(e) => handleDrop(e, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      colSpan, rowSpan,
                      'bg-[var(--bg-secondary)] border rounded-[var(--radius-lg)] overflow-hidden transition-all group',
                      dragOverId === widget.id ? 'border-[var(--accent-primary)] border-dashed'
                        : store.editingWidgetId === widget.id ? 'border-[var(--accent-primary)]'
                        : 'border-[var(--border-default)]',
                    )}
                  >
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-muted)] cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {store.editMode && <GripVertical size={12} className="text-[var(--text-muted)] shrink-0 opacity-0 group-hover:opacity-100" />}
                        <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{widget.title}</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* SUM / Individual toggle */}
                        {widget.type !== 'text' && widget.type !== 'kpi' && (
                          <button
                            onClick={() => store.updateWidget(widget.id, {
                              viewMode: widget.viewMode === 'individual' ? 'sum' : 'individual',
                            })}
                            className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                            title={widget.viewMode === 'individual' ? 'Switch to SUM' : 'Switch to Individual'}
                          >
                            <Eye size={11} className={cn(
                              widget.viewMode === 'individual' ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]',
                            )} />
                          </button>
                        )}
                        {store.editMode && (
                          <>
                            <button onClick={() => store.setEditingWidget(store.editingWidgetId === widget.id ? null : widget.id)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                              <Settings2 size={11} className="text-[var(--text-muted)]" />
                            </button>
                            <button onClick={() => store.removeWidget(widget.id)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                              <X size={11} className="text-[var(--text-muted)]" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="p-2 h-[calc(100%-28px)] overflow-hidden">
                      <WidgetRenderer widget={widget} promMode={mode !== 'demo'} />
                    </div>
                  </div>
                );
              })}

              {store.editMode && (
                <button
                  onClick={() => setShowAddPanel(!showAddPanel)}
                  className="col-span-1 row-span-1 border-2 border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] transition-colors"
                >
                  <Plus size={20} />
                  <span className="text-[10px]">Add Widget</span>
                </button>
              )}
            </div>

            {showAddPanel && store.editMode && (
              <Card className="mt-3">
                <CardHeader><CardTitle>Add Widget</CardTitle></CardHeader>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                  {WIDGET_TYPES.map((wt) => (
                    <button
                      key={wt.type}
                      onClick={() => { store.addWidget(wt.type); setShowAddPanel(false); }}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <span className="text-[var(--accent-primary)]">{wt.icon}</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">{wt.label}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Config panel */}
          {editWidget && store.editMode && (
            <div className="w-[260px] shrink-0">
              <Card>
                <CardHeader>
                  <CardTitle>Widget Settings</CardTitle>
                  <button onClick={() => store.setEditingWidget(null)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                    <X size={13} className="text-[var(--text-muted)]" />
                  </button>
                </CardHeader>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Title</label>
                    <input
                      type="text"
                      value={editWidget.title}
                      onChange={(e) => store.updateWidget(editWidget.id, { title: e.target.value })}
                      className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Type</label>
                    <div className="flex flex-wrap gap-1">
                      {WIDGET_TYPES.map((wt) => (
                        <button key={wt.type} onClick={() => store.updateWidget(editWidget.id, { type: wt.type })}
                          className={cn('flex items-center gap-1 px-2 py-1 text-[10px] rounded-[var(--radius-sm)] transition-colors',
                            editWidget.type === wt.type ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}>
                          {wt.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Size</label>
                    <div className="flex gap-1">
                      {SIZE_OPTIONS.map((s) => (
                        <button key={s.value} onClick={() => store.updateWidget(editWidget.id, { size: s.value })}
                          className={cn('px-2 py-1 text-[10px] rounded-[var(--radius-sm)] transition-colors',
                            editWidget.size === s.value ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editWidget.type !== 'text' && (
                    <>
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">Metric</label>
                        <select value={editWidget.metric ?? ''} onChange={(e) => store.updateWidget(editWidget.id, { metric: e.target.value })}
                          className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]">
                          {METRIC_CATALOG.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">PromQL (optional)</label>
                        <input type="text" placeholder="e.g. rate(http_requests_total[5m])"
                          value={editWidget.query ?? ''}
                          onChange={(e) => store.updateWidget(editWidget.id, { query: e.target.value })}
                          className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] font-mono text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                        />
                        <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Prometheus 연결 시 실시간 쿼리. 미입력 시 데모 데이터.</div>
                      </div>
                    </>
                  )}
                  {editWidget.type === 'text' && (
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Content</label>
                      <textarea value={editWidget.content ?? ''} rows={4}
                        onChange={(e) => store.updateWidget(editWidget.id, { content: e.target.value })}
                        className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-primary)]" />
                    </div>
                  )}
                  <button onClick={() => store.removeWidget(editWidget.id)}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 rounded-[var(--radius-sm)] transition-colors">
                    <Trash2 size={12} /> Remove Widget
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── Dashboard List View ── */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => { store.createDashboard('New Dashboard'); setViewMode('builder'); }}>
              <FolderPlus size={12} /> New Dashboard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={12} /> Import JSON
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dashboards.map((db) => (
              <Card key={db.id} className={cn(
                'hover:border-[var(--accent-primary)] transition-colors cursor-pointer',
                db.id === store.activeDashboardId && 'border-[var(--accent-primary)]',
              )}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{db.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{db.description || `${db.widgets.length} widgets`}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); store.cloneDashboard(db.id); }}
                      className="p-1 hover:bg-[var(--bg-tertiary)] rounded" title="Clone">
                      <Copy size={12} className="text-[var(--text-muted)]" />
                    </button>
                    {dashboards.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); store.deleteDashboard(db.id); }}
                        className="p-1 hover:bg-[var(--bg-tertiary)] rounded" title="Delete">
                        <Trash2 size={12} className="text-[var(--text-muted)]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 mb-3">
                  {db.widgets.slice(0, 8).map((w) => (
                    <div key={w.id} className={cn('h-3 rounded-sm',
                      w.type === 'kpi' ? 'bg-[#58A6FF]/20' : w.type === 'timeseries' ? 'bg-[#3FB950]/20'
                        : w.type === 'bar' ? 'bg-[#D29922]/20' : w.type === 'gauge' ? 'bg-[#BC8CFF]/20'
                        : w.type === 'pie' ? 'bg-[#F778BA]/20' : 'bg-[var(--bg-tertiary)]',
                      w.size.startsWith('2') ? 'col-span-2' : 'col-span-1')} />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {db.widgets.length} widgets · {new Date(db.updatedAt).toLocaleDateString()}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => { store.setActiveDashboard(db.id); setViewMode('builder'); }}>
                    Open
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Templates View ── */}
      {viewMode === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="hover:border-[var(--accent-primary)] transition-colors">
              <div className="mb-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{tpl.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{tpl.description}</div>
              </div>
              <div className="grid grid-cols-4 gap-1 mb-3">
                {tpl.widgets.slice(0, 8).map((w) => (
                  <div key={w.id} className={cn('h-4 rounded-sm',
                    w.type === 'kpi' ? 'bg-[#58A6FF]/20' : w.type === 'timeseries' ? 'bg-[#3FB950]/20'
                      : w.type === 'bar' ? 'bg-[#D29922]/20' : w.type === 'gauge' ? 'bg-[#BC8CFF]/20'
                      : w.type === 'pie' ? 'bg-[#F778BA]/20' : 'bg-[var(--bg-tertiary)]',
                    w.size.startsWith('2') ? 'col-span-2' : 'col-span-1')} />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">{tpl.widgets.length} widgets</span>
                <Button variant="secondary" size="sm" onClick={() => { store.loadTemplate(tpl.id); setViewMode('builder'); }}>
                  Use Template
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget Renderer (supports PromQL + Demo + Gauge + SUM/Individual) ──

function WidgetRenderer({ widget, promMode }: { widget: WidgetConfig; promMode: boolean }) {
  const [liveData, setLiveData] = useState<{ label: string; data: [number, number][] }[] | null>(null);
  const [source, setSource] = useState<'live' | 'demo'>('demo');

  // Try Prometheus if PromQL query exists and mode is not demo
  useEffect(() => {
    if (!promMode || !widget.query) { setLiveData(null); setSource('demo'); return; }
    let cancelled = false;
    queryPrometheus(widget.query, 30).then((result) => {
      if (cancelled) return;
      if (result) { setLiveData(result); setSource('live'); }
      else { setLiveData(null); setSource('demo'); }
    });
    return () => { cancelled = true; };
  }, [widget.query, promMode]);

  const demoData = useMemo(() => {
    if (!widget.metric) return [];
    return executeMetricQuery(widget.metric, 30);
  }, [widget.metric]);

  const seriesData = liveData ?? demoData;

  // Gauge widget
  if (widget.type === 'gauge') {
    const val = seriesData[0]?.data;
    const lastVal = val ? Math.round(val[val.length - 1]?.[1] ?? 0) : 0;
    const maxVal = val ? Math.max(...val.map((d) => d[1])) : 100;
    const pct = maxVal > 0 ? (lastVal / maxVal) * 100 : 0;
    const color = pct > 80 ? '#F85149' : pct > 60 ? '#D29922' : '#3FB950';
    const h = widget.size.endsWith('2') ? 240 : 100;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const option: any = {
      animation: false,
      series: [{
        type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: Math.round(maxVal * 1.2) || 100,
        pointer: { show: true, length: '60%', width: 4, itemStyle: { color } },
        progress: { show: true, width: 12, itemStyle: { color } },
        axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { show: false },
        axisLine: { lineStyle: { width: 12, color: [[1, '#30363D']] } },
        detail: { valueAnimation: true, fontSize: 18, color: '#E6EDF3', offsetCenter: [0, '60%'],
          formatter: (v: number) => `${v}` },
        data: [{ value: lastVal }],
      }],
    };
    return <EChartsWrapper option={option} height={h} />;
  }

  if (widget.type === 'kpi') {
    const val = seriesData[0]?.data;
    const lastVal = val ? Math.round(val[val.length - 1]?.[1] ?? 0) : 0;
    const metric = METRIC_CATALOG.find((m) => m.name === widget.metric);
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{lastVal}</span>
          {source === 'live' && <DataSourceBadge source="live" />}
        </div>
        <div className="text-[10px] text-[var(--text-muted)] mt-1">{metric?.unit ?? ''}</div>
      </div>
    );
  }

  if (widget.type === 'timeseries' || widget.type === 'bar') {
    const isIndividual = widget.viewMode === 'individual';
    let series;
    if (isIndividual) {
      series = seriesData.map((s, i) => ({
        name: s.label, data: s.data,
        color: CHART_COLORS[i % CHART_COLORS.length],
        type: widget.type === 'bar' ? 'bar' as const : 'line' as const,
      }));
    } else {
      // SUM mode: aggregate all series
      if (seriesData.length > 1) {
        const summed = seriesData[0].data.map(([ts], idx) => {
          const total = seriesData.reduce((acc, s) => acc + (s.data[idx]?.[1] ?? 0), 0);
          return [ts, total] as [number, number];
        });
        series = [{ name: 'SUM', data: summed, color: CHART_COLORS[0], type: widget.type === 'bar' ? 'bar' as const : 'line' as const }];
      } else {
        series = seriesData.map((s, i) => ({
          name: s.label, data: s.data,
          color: CHART_COLORS[i % CHART_COLORS.length],
          type: widget.type === 'bar' ? 'bar' as const : 'line' as const,
        }));
      }
    }
    if (series.length === 0) return <EmptyWidget />;
    const h = widget.size.endsWith('2') ? 240 : 100;
    return <TimeSeriesChart series={series} height={h} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (widget.type === 'pie') {
    const pieData = seriesData.map((s, i) => ({
      name: s.label, value: Math.round(s.data[s.data.length - 1]?.[1] ?? 0),
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
    }));
    if (pieData.length === 0) return <EmptyWidget />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const option: any = {
      animation: false,
      series: [{ type: 'pie', radius: ['40%', '70%'], data: pieData, label: { show: false }, emphasis: { label: { show: true, fontSize: 10 } } }],
      tooltip: { trigger: 'item' },
    };
    const h2 = widget.size.endsWith('2') ? 240 : 100;
    return <EChartsWrapper option={option} height={h2} />;
  }

  if (widget.type === 'table') {
    return (
      <div className="text-[10px] overflow-auto h-full">
        <table className="w-full">
          <thead>
            <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-muted)]">
              <th className="pb-1 font-medium">Series</th>
              <th className="pb-1 font-medium text-right">Last</th>
              <th className="pb-1 font-medium text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {seriesData.map((s) => {
              const values = s.data.map((d) => d[1]);
              const last = values[values.length - 1] ?? 0;
              const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              return (
                <tr key={s.label} className="border-b border-[var(--border-muted)]">
                  <td className="py-0.5 text-[var(--text-primary)]">{s.label}</td>
                  <td className="py-0.5 text-right tabular-nums text-[var(--text-secondary)]">{last.toFixed(1)}</td>
                  <td className="py-0.5 text-right tabular-nums text-[var(--text-muted)]">{avg.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'text') {
    return (
      <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed h-full overflow-auto">
        {widget.content ?? 'Empty note'}
      </div>
    );
  }

  return <EmptyWidget />;
}

function EmptyWidget() {
  return <div className="h-full flex items-center justify-center text-[10px] text-[var(--text-muted)]">No data</div>;
}
