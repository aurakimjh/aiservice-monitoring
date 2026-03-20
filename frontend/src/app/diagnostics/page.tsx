'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { getDiagnosticRuns, getDiagnosticItems } from '@/lib/demo-data';
import { getRelativeTime } from '@/lib/utils';
import type { DiagnosticItem } from '@/types/monitoring';
import {
  Stethoscope,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lightbulb,
  FileText,
} from 'lucide-react';

const SCOPE_LABELS: Record<string, string> = { full: 'Full Scan', ai: 'AI Services', infra: 'Infrastructure' };

const RESULT_ICON = {
  pass: <CheckCircle2 size={13} className="text-[var(--status-healthy)]" />,
  warn: <AlertTriangle size={13} className="text-[var(--status-warning)]" />,
  fail: <XCircle size={13} className="text-[var(--status-critical)]" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  os: 'OS', middleware: 'Middleware', gpu: 'GPU', llm: 'LLM', vectordb: 'VectorDB', guardrail: 'Guardrail', agent: 'Agent',
};

export default function DiagnosticsPage() {
  const runs = useMemo(() => getDiagnosticRuns(), []);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const items = useMemo(() => selectedRunId ? getDiagnosticItems(selectedRunId) : [], [selectedRunId]);

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items;
    return items.filter((i) => i.category === categoryFilter);
  }, [items, categoryFilter]);

  // Group items by category
  const grouped = useMemo(() => {
    const groups: Record<string, DiagnosticItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredItems]);

  // Overall stats
  const latestRun = runs[0];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Diagnostics', icon: <Stethoscope size={14} /> },
      ]} />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">AITOP Diagnostics</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="IT Items" value={55} subtitle="OS, Middleware, Network" />
        <KPICard title="AI Items" value={31} subtitle="LLM, GPU, VectorDB, Guardrail" />
        <KPICard title="Last Scan" value={latestRun ? getRelativeTime(new Date(latestRun.timestamp)) : '—'} subtitle={latestRun ? `${latestRun.duration}s duration` : ''} status={latestRun?.status === 'healthy' ? 'healthy' : latestRun?.status === 'warning' ? 'warning' : 'critical'} />
        <KPICard title="Pass Rate" value={latestRun ? `${Math.round((latestRun.passed / latestRun.items) * 100)}%` : '—'} subtitle={latestRun ? `${latestRun.passed}/${latestRun.items} passed` : ''} status={latestRun && latestRun.failed > 0 ? 'warning' : 'healthy'} />
      </div>

      {/* Run History */}
      <Card padding="none">
        <div className="px-4 py-2.5 border-b border-[var(--border-default)]">
          <span className="text-xs font-medium text-[var(--text-primary)]">Diagnostic Runs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2 font-medium">Run ID</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium text-right">Items</th>
                <th className="px-4 py-2 font-medium text-right">Passed</th>
                <th className="px-4 py-2 font-medium text-right">Warned</th>
                <th className="px-4 py-2 font-medium text-right">Failed</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    'border-b border-[var(--border-muted)] cursor-pointer transition-colors',
                    selectedRunId === run.id ? 'bg-[var(--accent-primary)]/10' : 'hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  <td className="px-4 py-2 font-mono text-[var(--accent-primary)]">{run.id}</td>
                  <td className="px-4 py-2"><Badge>{SCOPE_LABELS[run.scope]}</Badge></td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{run.items}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--status-healthy)]">{run.passed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--status-warning)]">{run.warned}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--status-critical)]">{run.failed}</td>
                  <td className="px-4 py-2"><StatusIndicator status={run.status} size="sm" /></td>
                  <td className="px-4 py-2 text-[var(--text-muted)] tabular-nums">{getRelativeTime(new Date(run.timestamp))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Diagnostic Items */}
      {selectedRun && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {selectedRun.id} — {SCOPE_LABELS[selectedRun.scope]}
            </span>
            <button onClick={() => setCategoryFilter('all')} className={cn('px-2 py-1 text-[11px] font-medium rounded-[var(--radius-sm)]', categoryFilter === 'all' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]')}>
              All ({items.length})
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
              const count = items.filter((i) => i.category === key).length;
              if (count === 0) return null;
              return (
                <button key={key} onClick={() => setCategoryFilter(key)} className={cn('px-2 py-1 text-[11px] font-medium rounded-[var(--radius-sm)]', categoryFilter === key ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]')}>
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {Object.entries(grouped).map(([category, catItems]) => (
            <Card key={category} padding="none">
              <div className="px-4 py-2 border-b border-[var(--border-default)] text-xs font-semibold text-[var(--text-primary)]">
                {CATEGORY_LABELS[category] ?? category}
                <span className="ml-2 text-[var(--text-muted)] font-normal">({catItems.length} items)</span>
              </div>
              <div className="divide-y divide-[var(--border-muted)]">
                {catItems.map((item) => {
                  const isExpanded = expandedItem === item.id;
                  return (
                    <div key={item.id}>
                      <div
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
                      >
                        <ChevronRight size={12} className={cn('text-[var(--text-muted)] transition-transform shrink-0', isExpanded && 'rotate-90')} />
                        {RESULT_ICON[item.result]}
                        <span className="font-mono text-[10px] text-[var(--text-muted)] w-16 shrink-0">{item.id}</span>
                        <span className="text-xs text-[var(--text-primary)] flex-1">{item.name}</span>
                        <span className="text-xs tabular-nums text-[var(--text-secondary)] font-mono">{item.value}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">threshold: {item.threshold}</span>
                      </div>
                      {isExpanded && item.recommendation && (
                        <div className="px-4 pb-3 ml-10">
                          <div className="flex items-start gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)]">
                            <Lightbulb size={13} className="text-[var(--status-warning)] shrink-0 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Recommendation</div>
                              <div className="text-xs text-[var(--text-primary)]">{item.recommendation}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
