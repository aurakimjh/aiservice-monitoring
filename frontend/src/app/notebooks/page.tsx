'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, Button, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { TimeSeriesChart } from '@/components/charts';
import { getSampleNotebooks, executeMetricQuery, METRIC_CATALOG } from '@/lib/demo-data';
import { getRelativeTime } from '@/lib/utils';
import type { Notebook, NotebookCell, NotebookCellType } from '@/types/monitoring';
import {
  BookOpen,
  Plus,
  X,
  Play,
  ChevronUp,
  ChevronDown,
  Trash2,
  FileText,
  Code,
  BarChart3,
  GripVertical,
  Tag,
  User,
  Clock,
  AlertTriangle,
  Check,
  Pencil,
} from 'lucide-react';

const CELL_TYPES: { type: NotebookCellType; label: string; icon: React.ReactNode }[] = [
  { type: 'markdown', label: 'Text', icon: <FileText size={13} /> },
  { type: 'query', label: 'Query', icon: <Code size={13} /> },
  { type: 'chart', label: 'Chart', icon: <BarChart3 size={13} /> },
];

const CHART_COLORS = ['#58A6FF', '#3FB950', '#D29922', '#F85149', '#BC8CFF'];

let cellCounter = 200;
function newCellId() { return `c-${++cellCounter}`; }

export default function NotebooksPage() {
  const demoFallback = useCallback(() => getSampleNotebooks(), []);
  const { data: rawData, source } = useDataSource('/notebooks', demoFallback, { refreshInterval: 30_000 });
  const sampleNotebooks: Notebook[] = Array.isArray(rawData) ? rawData : (rawData as any)?.items ?? [];
  const [notebooks, setNotebooks] = useState<Notebook[]>(sampleNotebooks);
  const initializedRef = useRef(false);
  useEffect(() => {
    if (sampleNotebooks.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      setNotebooks(sampleNotebooks);
    }
  }, [sampleNotebooks]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId);

  const createNotebook = () => {
    const nb: Notebook = {
      id: `nb-${Date.now()}`,
      title: 'Untitled Notebook',
      description: '',
      author: 'kim.aura',
      cells: [{ id: newCellId(), type: 'markdown', content: '## New Investigation\n\nDescribe the issue here...' }],
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotebooks((prev) => [nb, ...prev]);
    setActiveNotebookId(nb.id);
  };

  const updateNotebook = (id: string, updates: Partial<Notebook>) => {
    setNotebooks((prev) => prev.map((n) => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n));
  };

  const addCell = (type: NotebookCellType) => {
    if (!activeNotebook) return;
    const cell: NotebookCell = {
      id: newCellId(),
      type,
      content: type === 'markdown' ? 'Enter text...' : type === 'query' ? 'http_requests_total' : 'http_requests_total',
    };
    updateNotebook(activeNotebook.id, { cells: [...activeNotebook.cells, cell] });
    setEditingCellId(cell.id);
  };

  const updateCell = (cellId: string, updates: Partial<NotebookCell>) => {
    if (!activeNotebook) return;
    updateNotebook(activeNotebook.id, {
      cells: activeNotebook.cells.map((c) => c.id === cellId ? { ...c, ...updates } : c),
    });
  };

  const removeCell = (cellId: string) => {
    if (!activeNotebook) return;
    updateNotebook(activeNotebook.id, { cells: activeNotebook.cells.filter((c) => c.id !== cellId) });
    if (editingCellId === cellId) setEditingCellId(null);
  };

  const moveCellUp = (cellId: string) => {
    if (!activeNotebook) return;
    const cells = [...activeNotebook.cells];
    const idx = cells.findIndex((c) => c.id === cellId);
    if (idx <= 0) return;
    [cells[idx - 1], cells[idx]] = [cells[idx], cells[idx - 1]];
    updateNotebook(activeNotebook.id, { cells });
  };

  const moveCellDown = (cellId: string) => {
    if (!activeNotebook) return;
    const cells = [...activeNotebook.cells];
    const idx = cells.findIndex((c) => c.id === cellId);
    if (idx === -1 || idx >= cells.length - 1) return;
    [cells[idx], cells[idx + 1]] = [cells[idx + 1], cells[idx]];
    updateNotebook(activeNotebook.id, { cells });
  };

  // ── Notebook List View ──
  if (!activeNotebook) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Notebooks', icon: <BookOpen size={14} /> }]} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Investigation Notebooks</h1>
            <DataSourceBadge source={source} />
          </div>
          <Button variant="primary" size="md" onClick={createNotebook}><Plus size={14} /> New Notebook</Button>
        </div>

        <div className="space-y-2">
          {notebooks.map((nb) => (
            <Card
              key={nb.id}
              className="cursor-pointer hover:border-[var(--accent-primary)] transition-colors"
              onClick={() => setActiveNotebookId(nb.id)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{nb.title}</span>
                    {nb.relatedIncident && (
                      <Badge variant="severity" severity="warning">
                        <AlertTriangle size={10} /> {nb.relatedIncident}
                      </Badge>
                    )}
                  </div>
                  {nb.description && (
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{nb.description}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><User size={10} /> {nb.author}</span>
                    <span className="flex items-center gap-1"><Clock size={10} /> {getRelativeTime(new Date(nb.updatedAt))}</span>
                    <span>{nb.cells.length} cells</span>
                  </div>
                  {nb.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      {nb.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[10px] text-[var(--text-secondary)]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Notebook Editor View ──
  return (
    <div className="space-y-3">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Notebooks', href: '#', icon: <BookOpen size={14} /> },
        { label: activeNotebook.title },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={activeNotebook.title}
            onChange={(e) => updateNotebook(activeNotebook.id, { title: e.target.value })}
            className="text-lg font-semibold text-[var(--text-primary)] bg-transparent border-none outline-none w-full"
          />
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><User size={10} /> {activeNotebook.author}</span>
            <span className="flex items-center gap-1"><Clock size={10} /> Updated {getRelativeTime(new Date(activeNotebook.updatedAt))}</span>
            {activeNotebook.relatedIncident && (
              <span className="flex items-center gap-1 text-[var(--status-warning)]">
                <AlertTriangle size={10} /> {activeNotebook.relatedIncident}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => setActiveNotebookId(null)}>
            <X size={12} /> Close
          </Button>
        </div>
      </div>

      {/* Cells */}
      <div className="space-y-2">
        {activeNotebook.cells.map((cell, idx) => (
          <CellRenderer
            key={cell.id}
            cell={cell}
            isEditing={editingCellId === cell.id}
            onEdit={() => setEditingCellId(editingCellId === cell.id ? null : cell.id)}
            onUpdate={(updates) => updateCell(cell.id, updates)}
            onRemove={() => removeCell(cell.id)}
            onMoveUp={() => moveCellUp(cell.id)}
            onMoveDown={() => moveCellDown(cell.id)}
            isFirst={idx === 0}
            isLast={idx === activeNotebook.cells.length - 1}
          />
        ))}
      </div>

      {/* Add cell bar */}
      <div className="flex items-center justify-center gap-2 py-2">
        {CELL_TYPES.map((ct) => (
          <button
            key={ct.type}
            onClick={() => addCell(ct.type)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] border border-dashed border-[var(--border-default)] hover:border-[var(--accent-primary)] rounded-[var(--radius-md)] transition-colors"
          >
            {ct.icon} Add {ct.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Cell Renderer ──

function CellRenderer({
  cell,
  isEditing,
  onEdit,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  cell: NotebookCell;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<NotebookCell>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className={cn(
      'group border rounded-[var(--radius-lg)] overflow-hidden transition-colors',
      isEditing ? 'border-[var(--accent-primary)]' : 'border-[var(--border-default)] hover:border-[var(--border-emphasis)]',
    )}>
      {/* Cell toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-muted)]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">
            {cell.type === 'markdown' && <><FileText size={10} className="inline" /> Text</>}
            {cell.type === 'query' && <><Code size={10} className="inline" /> Query</>}
            {cell.type === 'chart' && <><BarChart3 size={10} className="inline" /> Chart</>}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isFirst && <button onClick={onMoveUp} className="p-0.5 hover:bg-[var(--bg-overlay)] rounded"><ChevronUp size={12} className="text-[var(--text-muted)]" /></button>}
          {!isLast && <button onClick={onMoveDown} className="p-0.5 hover:bg-[var(--bg-overlay)] rounded"><ChevronDown size={12} className="text-[var(--text-muted)]" /></button>}
          <button onClick={onEdit} className="p-0.5 hover:bg-[var(--bg-overlay)] rounded"><Pencil size={11} className="text-[var(--text-muted)]" /></button>
          <button onClick={onRemove} className="p-0.5 hover:bg-[var(--bg-overlay)] rounded"><Trash2 size={11} className="text-[var(--text-muted)]" /></button>
        </div>
      </div>

      {/* Cell content */}
      <div className="p-3">
        {cell.type === 'markdown' && (
          isEditing ? (
            <textarea
              value={cell.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              rows={Math.max(4, cell.content.split('\n').length + 1)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] p-2 text-xs font-mono text-[var(--text-primary)] resize-y focus:outline-none focus:border-[var(--accent-primary)]"
              autoFocus
            />
          ) : (
            <div
              onClick={onEdit}
              className="prose prose-sm prose-invert max-w-none text-xs text-[var(--text-primary)] leading-relaxed cursor-text"
            >
              <MarkdownRenderer content={cell.content} />
            </div>
          )
        )}

        {cell.type === 'query' && (
          <div className="space-y-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <select
                  value={cell.content}
                  onChange={(e) => onUpdate({ content: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {METRIC_CATALOG.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div onClick={onEdit} className="px-2 py-1 bg-[var(--bg-primary)] rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--accent-primary)] cursor-pointer">
                {cell.content}
              </div>
            )}
            <QueryResult query={cell.content} />
          </div>
        )}

        {cell.type === 'chart' && (
          <div className="space-y-2">
            {isEditing && (
              <select
                value={cell.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                className="w-full px-2 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-[var(--radius-sm)] font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {METRIC_CATALOG.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            )}
            <ChartResult metric={cell.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Simple Markdown Renderer (no external lib) ──

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-sm font-bold text-[var(--text-primary)] mt-2">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-xs font-bold text-[var(--text-primary)] mt-1.5">{line.slice(4)}</h3>;
        if (line.startsWith('- [x] ')) return <div key={i} className="flex items-center gap-1.5 text-xs"><Check size={12} className="text-[var(--status-healthy)]" /><span className="line-through text-[var(--text-muted)]">{line.slice(6)}</span></div>;
        if (line.startsWith('- [ ] ')) return <div key={i} className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 border border-[var(--border-default)] rounded-sm" /><span>{line.slice(6)}</span></div>;
        if (line.startsWith('- ')) return <div key={i} className="text-xs pl-2 flex items-start gap-1"><span className="text-[var(--text-muted)] mt-1">•</span>{renderInline(line.slice(2))}</div>;
        if (line.startsWith('| ')) return <div key={i} className="font-mono text-[10px] text-[var(--text-secondary)]">{line}</div>;
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <div key={i} className="text-xs">{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-[var(--text-primary)]">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded text-[10px] font-mono text-[var(--accent-primary)]">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ── Query Result ──

function QueryResult({ query }: { query: string }) {
  const data = useMemo(() => executeMetricQuery(query, 10), [query]);
  if (data.length === 0) return <div className="text-[10px] text-[var(--text-muted)]">No data for query</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-muted)]">
            <th className="pb-1 font-medium">Series</th>
            <th className="pb-1 font-medium text-right">Current</th>
            <th className="pb-1 font-medium text-right">Avg</th>
            <th className="pb-1 font-medium text-right">Min</th>
            <th className="pb-1 font-medium text-right">Max</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => {
            const values = s.data.map((d) => d[1]);
            const last = values[values.length - 1] ?? 0;
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return (
              <tr key={s.label} className="border-b border-[var(--border-muted)]">
                <td className="py-0.5 text-[var(--accent-primary)] font-mono">{s.label}</td>
                <td className="py-0.5 text-right tabular-nums text-[var(--text-primary)] font-medium">{last.toFixed(1)}</td>
                <td className="py-0.5 text-right tabular-nums text-[var(--text-secondary)]">{avg.toFixed(1)}</td>
                <td className="py-0.5 text-right tabular-nums text-[var(--text-muted)]">{Math.min(...values).toFixed(1)}</td>
                <td className="py-0.5 text-right tabular-nums text-[var(--text-muted)]">{Math.max(...values).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Chart Result ──

function ChartResult({ metric }: { metric: string }) {
  const data = useMemo(() => executeMetricQuery(metric, 60), [metric]);
  if (data.length === 0) return <div className="text-[10px] text-[var(--text-muted)]">No data</div>;

  const series = data.map((s, i) => ({
    name: s.label,
    data: s.data,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const m = METRIC_CATALOG.find((c) => c.name === metric);
  return <TimeSeriesChart series={series} yAxisLabel={m?.unit} height={180} />;
}
