'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, Tabs } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart, EChartsWrapper } from '@/components/charts';
import { getDashboardTemplates, METRIC_CATALOG, executeMetricQuery, generateTimeSeries } from '@/lib/demo-data';
import type { WidgetConfig, WidgetType, WidgetSize, DashboardConfig } from '@/types/monitoring';
import {
  LayoutDashboard,
  Plus,
  X,
  GripVertical,
  Settings2,
  Save,
  Download,
  Upload,
  Copy,
  BarChart3,
  LineChart,
  PieChart,
  Type,
  Hash,
  Table2,
  Trash2,
  ChevronDown,
  Check,
} from 'lucide-react';

// ── Widget Type Config ──

const WIDGET_TYPES: { type: WidgetType; label: string; icon: React.ReactNode }[] = [
  { type: 'kpi', label: 'KPI Card', icon: <Hash size={14} /> },
  { type: 'timeseries', label: 'Time Series', icon: <LineChart size={14} /> },
  { type: 'bar', label: 'Bar Chart', icon: <BarChart3 size={14} /> },
  { type: 'pie', label: 'Pie Chart', icon: <PieChart size={14} /> },
  { type: 'table', label: 'Table', icon: <Table2 size={14} /> },
  { type: 'text', label: 'Text / Note', icon: <Type size={14} /> },
];

const SIZE_OPTIONS: { value: WidgetSize; label: string }[] = [
  { value: '1x1', label: '1×1' },
  { value: '2x1', label: '2×1 (wide)' },
  { value: '1x2', label: '1×2 (tall)' },
  { value: '2x2', label: '2×2 (large)' },
];

const CHART_COLORS = ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF', '#F778BA'];

const VIEW_TABS = [
  { id: 'builder', label: 'Builder', icon: <LayoutDashboard size={13} /> },
  { id: 'templates', label: 'Templates', icon: <Copy size={13} /> },
];

let widgetCounter = 100;
function newWidgetId() { return `w-${++widgetCounter}`; }

// ── Page ──

export default function DashboardBuilderPage() {
  const templates = useMemo(() => getDashboardTemplates(), []);
  const [viewMode, setViewMode] = useState('builder');
  const [dashboard, setDashboard] = useState<DashboardConfig>(() => ({
    ...templates[0],
    id: 'custom-1',
    name: 'My Dashboard',
    description: 'Custom dashboard',
  }));
  const [editingWidget, setEditingWidget] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Drag & Drop handlers ──
  const handleDragStart = (widgetId: string) => {
    dragItemRef.current = widgetId;
  };

  const handleDragOver = (e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    if (dragItemRef.current && dragItemRef.current !== widgetId) {
      setDragOverId(widgetId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = dragItemRef.current;
    if (!sourceId || sourceId === targetId) return;

    setDashboard((prev) => {
      const widgets = [...prev.widgets];
      const srcIdx = widgets.findIndex((w) => w.id === sourceId);
      const tgtIdx = widgets.findIndex((w) => w.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const [moved] = widgets.splice(srcIdx, 1);
      widgets.splice(tgtIdx, 0, moved);
      return { ...prev, widgets, updatedAt: Date.now() };
    });
    dragItemRef.current = null;
  };

  const handleDragEnd = () => {
    dragItemRef.current = null;
    setDragOverId(null);
  };

  // ── Widget CRUD ──
  const addWidget = (type: WidgetType) => {
    const w: WidgetConfig = {
      id: newWidgetId(),
      type,
      title: `New ${WIDGET_TYPES.find((t) => t.type === type)?.label ?? 'Widget'}`,
      size: type === 'kpi' ? '1x1' : '2x1',
      metric: type !== 'text' ? 'http_requests_total' : undefined,
      content: type === 'text' ? 'Enter your notes here...' : undefined,
    };
    setDashboard((prev) => ({ ...prev, widgets: [...prev.widgets, w], updatedAt: Date.now() }));
    setShowAddPanel(false);
    setEditingWidget(w.id);
  };

  const removeWidget = (id: string) => {
    setDashboard((prev) => ({ ...prev, widgets: prev.widgets.filter((w) => w.id !== id), updatedAt: Date.now() }));
    if (editingWidget === id) setEditingWidget(null);
  };

  const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
    setDashboard((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => w.id === id ? { ...w, ...updates } : w),
      updatedAt: Date.now(),
    }));
  };

  const loadTemplate = (tpl: DashboardConfig) => {
    setDashboard({ ...tpl, id: 'custom-' + Date.now(), name: tpl.name + ' (copy)' });
    setViewMode('builder');
    setEditingWidget(null);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(dashboard, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dashboard.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const editWidget = editingWidget ? dashboard.widgets.find((w) => w.id === editingWidget) : null;

  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Dashboards', icon: <LayoutDashboard size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Dashboard Builder</h1>
          {viewMode === 'builder' && (
            <input
              type="text"
              value={dashboard.name}
              onChange={(e) => setDashboard((p) => ({ ...p, name: e.target.value }))}
              className="text-xs text-[var(--text-muted)] bg-transparent border-none outline-none hover:text-[var(--text-secondary)] focus:text-[var(--text-primary)] mt-0.5"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'builder' && (
            <>
              <Button variant="secondary" size="sm" onClick={handleExport}><Download size={12} /> Export</Button>
              <Button variant="primary" size="sm" onClick={handleSave}>
                {saved ? <><Check size={12} /> Saved</> : <><Save size={12} /> Save</>}
              </Button>
            </>
          )}
          <Tabs tabs={VIEW_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />
        </div>
      </div>

      {/* ── Builder View ── */}
      {viewMode === 'builder' && (
        <div className="flex gap-3">
          {/* Main grid */}
          <div className="flex-1 min-w-0">
            {/* Widget grid */}
            <div className="grid grid-cols-4 gap-3 auto-rows-[140px]">
              {dashboard.widgets.map((widget) => {
                const colSpan = widget.size.startsWith('2') ? 'col-span-2' : 'col-span-1';
                const rowSpan = widget.size.endsWith('2') ? 'row-span-2' : 'row-span-1';
                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={() => handleDragStart(widget.id)}
                    onDragOver={(e) => handleDragOver(e, widget.id)}
                    onDrop={(e) => handleDrop(e, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      colSpan, rowSpan,
                      'bg-[var(--bg-secondary)] border rounded-[var(--radius-lg)] overflow-hidden transition-all group',
                      dragOverId === widget.id
                        ? 'border-[var(--accent-primary)] border-dashed'
                        : editingWidget === widget.id
                          ? 'border-[var(--accent-primary)]'
                          : 'border-[var(--border-default)]',
                    )}
                  >
                    {/* Widget header */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-muted)] cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GripVertical size={12} className="text-[var(--text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{widget.title}</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingWidget(editingWidget === widget.id ? null : widget.id)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                          <Settings2 size={11} className="text-[var(--text-muted)]" />
                        </button>
                        <button onClick={() => removeWidget(widget.id)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                          <X size={11} className="text-[var(--text-muted)]" />
                        </button>
                      </div>
                    </div>
                    {/* Widget content */}
                    <div className="p-2 h-[calc(100%-28px)] overflow-hidden">
                      <WidgetRenderer widget={widget} />
                    </div>
                  </div>
                );
              })}

              {/* Add widget button */}
              <button
                onClick={() => setShowAddPanel(!showAddPanel)}
                className="col-span-1 row-span-1 border-2 border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-emphasis)] transition-colors"
              >
                <Plus size={20} />
                <span className="text-[10px]">Add Widget</span>
              </button>
            </div>

            {/* Add widget panel */}
            {showAddPanel && (
              <Card className="mt-3">
                <CardHeader><CardTitle>Add Widget</CardTitle></CardHeader>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {WIDGET_TYPES.map((wt) => (
                    <button
                      key={wt.type}
                      onClick={() => addWidget(wt.type)}
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
          {editWidget && (
            <div className="w-[260px] shrink-0">
              <Card>
                <CardHeader>
                  <CardTitle>Widget Settings</CardTitle>
                  <button onClick={() => setEditingWidget(null)} className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded">
                    <X size={13} className="text-[var(--text-muted)]" />
                  </button>
                </CardHeader>
                <div className="space-y-3">
                  {/* Title */}
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Title</label>
                    <input
                      type="text"
                      value={editWidget.title}
                      onChange={(e) => updateWidget(editWidget.id, { title: e.target.value })}
                      className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Type</label>
                    <div className="flex flex-wrap gap-1">
                      {WIDGET_TYPES.map((wt) => (
                        <button
                          key={wt.type}
                          onClick={() => updateWidget(editWidget.id, { type: wt.type })}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 text-[10px] rounded-[var(--radius-sm)] transition-colors',
                            editWidget.type === wt.type
                              ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                          )}
                        >
                          {wt.icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div>
                    <label className="block text-[10px] text-[var(--text-muted)] mb-1">Size</label>
                    <div className="flex gap-1">
                      {SIZE_OPTIONS.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => updateWidget(editWidget.id, { size: s.value })}
                          className={cn(
                            'px-2 py-1 text-[10px] rounded-[var(--radius-sm)] transition-colors',
                            editWidget.size === s.value
                              ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                              : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Metric (for non-text widgets) */}
                  {editWidget.type !== 'text' && (
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Metric</label>
                      <select
                        value={editWidget.metric ?? ''}
                        onChange={(e) => updateWidget(editWidget.id, { metric: e.target.value })}
                        className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      >
                        {METRIC_CATALOG.map((m) => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Content (for text widget) */}
                  {editWidget.type === 'text' && (
                    <div>
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Content</label>
                      <textarea
                        value={editWidget.content ?? ''}
                        onChange={(e) => updateWidget(editWidget.id, { content: e.target.value })}
                        rows={4}
                        className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] text-xs text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => removeWidget(editWidget.id)}
                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 rounded-[var(--radius-sm)] transition-colors"
                  >
                    <Trash2 size={12} /> Remove Widget
                  </button>
                </div>
              </Card>
            </div>
          )}
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
              {/* Mini preview grid */}
              <div className="grid grid-cols-4 gap-1 mb-3">
                {tpl.widgets.slice(0, 8).map((w) => (
                  <div
                    key={w.id}
                    className={cn(
                      'h-4 rounded-sm',
                      w.type === 'kpi' ? 'bg-[#58A6FF]/20' :
                      w.type === 'timeseries' ? 'bg-[#3FB950]/20' :
                      w.type === 'bar' ? 'bg-[#D29922]/20' :
                      w.type === 'pie' ? 'bg-[#F778BA]/20' :
                      w.type === 'text' ? 'bg-[#8B949E]/20' :
                      'bg-[var(--bg-tertiary)]',
                      w.size.startsWith('2') ? 'col-span-2' : 'col-span-1',
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">{tpl.widgets.length} widgets</span>
                <Button variant="secondary" size="sm" onClick={() => loadTemplate(tpl)}>Use Template</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Widget Renderer ──

function WidgetRenderer({ widget }: { widget: WidgetConfig }) {
  const seriesData = useMemo(() => {
    if (!widget.metric) return [];
    return executeMetricQuery(widget.metric, 30);
  }, [widget.metric]);

  if (widget.type === 'kpi') {
    const val = seriesData[0]?.data;
    const lastVal = val ? Math.round(val[val.length - 1]?.[1] ?? 0) : 0;
    const metric = METRIC_CATALOG.find((m) => m.name === widget.metric);
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-[28px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{lastVal}</div>
        <div className="text-[10px] text-[var(--text-muted)] mt-1">{metric?.unit ?? ''}</div>
      </div>
    );
  }

  if (widget.type === 'timeseries' || widget.type === 'bar') {
    const series = seriesData.map((s, i) => ({
      name: s.label,
      data: s.data,
      color: CHART_COLORS[i % CHART_COLORS.length],
      type: widget.type === 'bar' ? 'bar' as const : 'line' as const,
    }));
    if (series.length === 0) return <EmptyWidget />;
    const h = widget.size.endsWith('2') ? 240 : 100;
    return <TimeSeriesChart series={series} height={h} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (widget.type === 'pie') {
    const pieData = seriesData.map((s, i) => ({
      name: s.label,
      value: Math.round(s.data[s.data.length - 1]?.[1] ?? 0),
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
  return (
    <div className="h-full flex items-center justify-center text-[10px] text-[var(--text-muted)]">
      No data
    </div>
  );
}
