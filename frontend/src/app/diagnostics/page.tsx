'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { StatusIndicator, KPICard } from '@/components/monitoring';
import { getDiagnosticRuns, getDiagnosticItems, getReportTemplates, getGeneratedReports } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
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
  Download,
  Plus,
  Clock,
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

const TABS = [
  { id: 'diagnostics', label: 'Diagnostics', icon: <Stethoscope size={14} /> },
  { id: 'reports', label: 'Reports', icon: <FileText size={14} /> },
] as const;

const REPORT_TYPE_COLORS: Record<string, string> = {
  weekly: 'bg-blue-500/15 text-blue-400',
  monthly: 'bg-purple-500/15 text-purple-400',
  diagnostic: 'bg-orange-500/15 text-orange-400',
  custom: 'bg-gray-500/15 text-gray-400',
};

export default function DiagnosticsPage() {
  const demoRuns = useCallback(() => getDiagnosticRuns(), []);
  const { data: runsData, source } = useDataSource('/diagnostics/runs', demoRuns, { refreshInterval: 30_000 });
  const runs = runsData ?? [];
  const [activeTab, setActiveTab] = useState<string>('diagnostics');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const reportTemplates = useMemo(() => getReportTemplates(), []);
  const generatedReports = useMemo(() => getGeneratedReports(), []);

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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-[1px]',
              activeTab === tab.id
                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Report Templates */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Report Templates</h2>
            <button className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 rounded-[var(--radius-sm)] hover:bg-[var(--accent-primary)]/20 transition-colors">
              <Plus size={12} /> New Template
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reportTemplates.map((tpl) => (
              <Card key={tpl.id}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-[var(--accent-primary)]" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{tpl.name}</span>
                  </div>
                  <span className={cn('px-2 py-0.5 text-[10px] font-medium rounded-full', REPORT_TYPE_COLORS[tpl.type])}>
                    {tpl.type}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">{tpl.description}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {tpl.sections.map((s) => (
                    <span key={s} className="px-1.5 py-0.5 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-[var(--radius-sm)]">{s}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">~{tpl.estimatedPages} pages</span>
                  <button className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-[var(--radius-sm)] hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-colors">
                    <FileText size={11} /> Generate
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {/* Generated Reports */}
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Generated Reports</h2>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                    <th className="px-4 py-2 font-medium">Template Name</th>
                    <th className="px-4 py-2 font-medium">Period</th>
                    <th className="px-4 py-2 font-medium text-right">Pages</th>
                    <th className="px-4 py-2 font-medium">Format</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Size</th>
                    <th className="px-4 py-2 font-medium">Generated At</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {generatedReports.map((rpt) => (
                    <tr key={rpt.id} className="border-b border-[var(--border-muted)]">
                      <td className="px-4 py-2 text-[var(--text-primary)] font-medium">{rpt.templateName}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)] tabular-nums">{rpt.period}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{rpt.pages || '—'}</td>
                      <td className="px-4 py-2"><Badge>{rpt.format.toUpperCase()}</Badge></td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full',
                          rpt.status === 'completed' && 'bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]',
                          rpt.status === 'generating' && 'bg-blue-500/15 text-blue-400',
                          rpt.status === 'failed' && 'bg-[var(--status-critical)]/15 text-[var(--status-critical)]',
                        )}>
                          {rpt.status === 'generating' && <Clock size={10} className="animate-spin" />}
                          {rpt.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--text-secondary)]">{rpt.sizeKB ? `${(rpt.sizeKB / 1024).toFixed(1)} MB` : '—'}</td>
                      <td className="px-4 py-2 text-[var(--text-muted)] tabular-nums">{getRelativeTime(new Date(rpt.generatedAt))}</td>
                      <td className="px-4 py-2">
                        {rpt.status === 'completed' && (
                          <button className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors">
                            <Download size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'diagnostics' && <>
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
      </>}
    </div>
  );
}
