'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb, Card, CardHeader, CardTitle, Tabs, Badge, SearchInput, Select, Button, Modal } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts';
import { AISubNav } from '@/components/ai';
import { PromptEditor } from '@/components/ai/prompt-editor';
import { VersionDiff } from '@/components/ai/version-diff';
import { getPromptEntries, generateTimeSeries } from '@/lib/demo-data';
import { Bot, BookOpen, Tag, History, Play, GitCompare } from 'lucide-react';
import type { PromptEntry } from '@/types/monitoring';

const TAG_OPTIONS = [
  { label: 'All Tags', value: 'all' },
  { label: 'rag', value: 'rag' },
  { label: 'qa', value: 'qa' },
  { label: 'production', value: 'production' },
  { label: 'code', value: 'code' },
  { label: 'review', value: 'review' },
  { label: 'dev', value: 'dev' },
  { label: 'summary', value: 'summary' },
  { label: 'sql', value: 'sql' },
  { label: 'incident', value: 'incident' },
  { label: 'ops', value: 'ops' },
];

const MODEL_OPTIONS = [
  { label: 'All Models', value: 'all' },
  { label: 'gpt-4o', value: 'gpt-4o' },
  { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
  { label: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet' },
];

const DETAIL_TABS = [
  { id: 'editor', label: 'Editor', icon: <BookOpen size={12} /> },
  { id: 'history', label: 'History', icon: <History size={12} /> },
  { id: 'performance', label: 'Performance', icon: <Tag size={12} /> },
  { id: 'test', label: 'Test', icon: <Play size={12} /> },
];

function qualityColor(score: number): string {
  if (score >= 0.9) return 'text-[var(--status-healthy)]';
  if (score >= 0.8) return 'text-[var(--accent-primary)]';
  if (score >= 0.7) return 'text-[var(--status-warning)]';
  return 'text-[var(--status-critical)]';
}

export default function PromptHubPage() {
  const prompts = getPromptEntries();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [selected, setSelected] = useState<PromptEntry | null>(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [diffVersionIdx, setDiffVersionIdx] = useState<number | null>(null);

  // Test tab state
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; latency: number; tokens: number } | null>(null);

  const filtered = useMemo(() => {
    return prompts.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (tagFilter !== 'all' && !p.tags.includes(tagFilter)) return false;
      if (modelFilter !== 'all' && p.model !== modelFilter) return false;
      return true;
    });
  }, [prompts, search, tagFilter, modelFilter]);

  // KPIs
  const totalPrompts = prompts.length;
  const avgQuality = prompts.length > 0
    ? (prompts.reduce((s, p) => s + p.avgQualityScore, 0) / prompts.length).toFixed(2)
    : '0.00';
  const totalUsage24h = '8,530';
  const activeVersions = prompts.reduce((s, p) => s + p.versions.length, 0);

  const handleSelectPrompt = (p: PromptEntry) => {
    setSelected(p);
    setActiveTab('editor');
    setDiffVersionIdx(null);
    setTestResult(null);
    setTestInputs({});
    setTestRunning(false);
  };

  const handleBack = () => {
    setSelected(null);
    setDiffVersionIdx(null);
    setTestResult(null);
    setTestInputs({});
    setTestRunning(false);
  };

  const currentVersion = selected ? selected.versions.find((v) => v.version === selected.currentVersion) ?? selected.versions[0] : null;

  const handleRunTest = () => {
    if (!currentVersion) return;
    setTestRunning(true);
    setTestResult(null);
    setTimeout(() => {
      setTestRunning(false);
      setTestResult({
        text: `Based on the provided context, the answer to your question is as follows:\n\n1. The system processes requests through the RAG pipeline, retrieving relevant documents from the vector store.\n2. Results are ranked by relevance score and filtered by the configured threshold.\n3. The final response is generated using the retrieved context with citation markers.\n\n[Source 1] [Source 3]`,
        latency: 1200,
        tokens: 320,
      });
    }, 1000);
  };

  // Performance tab: quality score trend chart data
  const perfChartData = useMemo(() => {
    if (!selected) return [];
    const sortedVersions = [...selected.versions].sort((a, b) => a.version - b.version);
    return sortedVersions.map((v, i) => [
      Date.now() - (sortedVersions.length - i) * 86400_000,
      v.performance.avgQualityScore,
    ] as [number, number]);
  }, [selected]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
        { label: 'Prompt Hub', icon: <BookOpen size={14} /> },
      ]} />

      <AISubNav />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Prompt Hub</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total Prompts"
          value={totalPrompts}
          status="healthy"
          sparkData={[3, 3, 4, 4, 4, 5, 5, 5, 5, 5]}
        />
        <KPICard
          title="Avg Quality"
          value={avgQuality}
          status="healthy"
          sparkData={[0.78, 0.80, 0.82, 0.83, 0.85, 0.84, 0.86, 0.87, 0.87, 0.87]}
        />
        <KPICard
          title="24h Usage"
          value={totalUsage24h}
          subtitle="Total API calls"
          trend={{ direction: 'up', value: '+12%', positive: true }}
          status="healthy"
        />
        <KPICard
          title="Active Versions"
          value={activeVersions}
          subtitle="Across all prompts"
          status="healthy"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          placeholder="Search prompts..."
          className="w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          options={TAG_OPTIONS}
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filter by tag"
        />
        <Select
          options={MODEL_OPTIONS}
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          aria-label="Filter by model"
        />
      </div>

      {/* Main content: list or detail */}
      {!selected ? (
        /* ── List View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              hover
              onClick={() => handleSelectPrompt(p)}
              className="cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">{p.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{p.description}</p>
                </div>
                <Badge className={cn(
                  'text-[10px] shrink-0 ml-2',
                  p.isPublic
                    ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}>
                  {p.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1 mb-2">
                {p.tags.map((t) => (
                  <Badge key={t} className="text-[10px]">{t}</Badge>
                ))}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                <span className="font-mono">{p.model}</span>
                <span>{p.versions.length} version{p.versions.length !== 1 && 's'}</span>
                <span className={cn('font-medium tabular-nums', qualityColor(p.avgQualityScore))}>
                  Q: {p.avgQualityScore.toFixed(2)}
                </span>
                <span className="tabular-nums">{p.totalUsage.toLocaleString()} calls</span>
              </div>

              <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-muted)]">
                <span>Owner: {p.owner}</span>
              </div>
            </Card>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-sm text-[var(--text-muted)]">
              No prompts match your filters.
            </div>
          )}
        </div>
      ) : (
        /* ── Detail View ── */
        <div className="space-y-4">
          {/* Back link */}
          <button
            onClick={handleBack}
            className="text-xs text-[var(--accent-primary)] hover:underline"
          >
            &larr; Back to list
          </button>

          {/* Prompt header */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">{selected.name}</h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
                  <span className="font-mono">{selected.model}</span>
                  <span>Owner: {selected.owner}</span>
                  <Badge className={cn(
                    'text-[10px]',
                    selected.isPublic
                      ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                  )}>
                    {selected.isPublic ? 'Public' : 'Private'}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <div className={cn('text-lg font-bold tabular-nums', qualityColor(selected.avgQualityScore))}>
                  {selected.avgQualityScore.toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">Quality Score</div>
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <Tabs tabs={DETAIL_TABS} activeTab={activeTab} onChange={setActiveTab} />

          {/* Tab content */}
          {activeTab === 'editor' && currentVersion && (
            <Card>
              <CardHeader>
                <CardTitle>Version {currentVersion.version} (Current)</CardTitle>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {currentVersion.commitMessage}
                </span>
              </CardHeader>
              <PromptEditor
                systemPrompt={currentVersion.systemPrompt}
                userTemplate={currentVersion.userTemplate}
                variables={currentVersion.variables}
                readOnly
              />
            </Card>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <Card padding="none">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                        <th className="px-4 py-2.5 font-medium">Version</th>
                        <th className="px-4 py-2.5 font-medium">Author</th>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Commit Message</th>
                        <th className="px-4 py-2.5 font-medium text-right">Quality</th>
                        <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.versions.map((v, idx) => (
                        <tr
                          key={v.version}
                          className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                          <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                            v{v.version}
                            {v.version === selected.currentVersion && (
                              <Badge className="ml-1.5 text-[9px] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                                current
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)]">{v.author}</td>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)]">{v.commitMessage}</td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', qualityColor(v.performance.avgQualityScore))}>
                            {v.performance.avgQualityScore.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {idx < selected.versions.length - 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDiffVersionIdx(idx)}
                              >
                                <GitCompare size={12} />
                                Compare
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Diff modal */}
              <Modal
                open={diffVersionIdx !== null}
                onClose={() => setDiffVersionIdx(null)}
                title="Version Diff"
                size="xl"
              >
                {diffVersionIdx !== null && selected.versions[diffVersionIdx + 1] && (
                  <VersionDiff
                    versionA={selected.versions[diffVersionIdx]}
                    versionB={selected.versions[diffVersionIdx + 1]}
                    onClose={() => setDiffVersionIdx(null)}
                  />
                )}
              </Modal>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-4">
              {/* Quality trend chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Quality Score Trend</CardTitle>
                </CardHeader>
                <TimeSeriesChart
                  series={[
                    {
                      name: 'Quality Score',
                      data: perfChartData,
                      color: '#58A6FF',
                    },
                  ]}
                  yAxisLabel="Score"
                  height={240}
                />
              </Card>

              {/* Performance table */}
              <Card padding="none">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                        <th className="px-4 py-2.5 font-medium">Version</th>
                        <th className="px-4 py-2.5 font-medium text-right">Latency (ms)</th>
                        <th className="px-4 py-2.5 font-medium text-right">Quality</th>
                        <th className="px-4 py-2.5 font-medium text-right">Tokens</th>
                        <th className="px-4 py-2.5 font-medium text-right">Usage Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.versions.map((v) => (
                        <tr
                          key={v.version}
                          className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                          <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">v{v.version}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                            {v.performance.avgLatencyMs.toLocaleString()}
                          </td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', qualityColor(v.performance.avgQualityScore))}>
                            {v.performance.avgQualityScore.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                            {v.performance.avgTokens}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                            {v.performance.usageCount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'test' && currentVersion && (
            <Card>
              <CardHeader>
                <CardTitle>Test Prompt</CardTitle>
                <span className="text-[10px] text-[var(--text-muted)]">
                  v{currentVersion.version} - {selected.model}
                </span>
              </CardHeader>

              <div className="space-y-3">
                {/* Variable inputs */}
                {currentVersion.variables.map((v) => (
                  <div key={v}>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {v}
                    </label>
                    <textarea
                      value={testInputs[v] ?? ''}
                      onChange={(e) => setTestInputs((prev) => ({ ...prev, [v]: e.target.value }))}
                      placeholder={`Enter {{${v}}}...`}
                      rows={v === 'context' || v === 'document' || v === 'diff' || v === 'schema' || v === 'metrics' || v === 'logs' ? 4 : 2}
                      className={cn(
                        'w-full rounded-[var(--radius-md)] font-mono text-xs',
                        'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
                        'text-[var(--text-primary)] p-2.5',
                        'focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
                        'resize-y placeholder:text-[var(--text-muted)]',
                      )}
                    />
                  </div>
                ))}

                {/* Run button */}
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleRunTest}
                  disabled={testRunning}
                >
                  <Play size={14} />
                  {testRunning ? 'Running...' : 'Run Test'}
                </Button>

                {/* Test result */}
                {testResult && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span className="tabular-nums">Latency: <strong className="text-[var(--text-primary)]">{testResult.latency}ms</strong></span>
                      <span className="tabular-nums">Tokens: <strong className="text-[var(--text-primary)]">{testResult.tokens}</strong></span>
                    </div>
                    <div className={cn(
                      'rounded-[var(--radius-md)] p-3 text-xs leading-relaxed whitespace-pre-wrap',
                      'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
                      'text-[var(--text-primary)] font-mono',
                    )}>
                      {testResult.text}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
