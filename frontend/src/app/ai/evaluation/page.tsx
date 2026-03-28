'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AISubNav } from '@/components/ai';
import { Breadcrumb, Card, CardHeader, CardTitle, Tabs, Badge, Modal, Button, Select, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { useDataSource } from '@/hooks/use-data-source';
import { Input } from '@/components/ui';
import { getEvalJobs, getEvalSamples, getABTests } from '@/lib/demo-data';
import { EvalJobTable } from '@/components/ai/eval-job-table';
import { EvalSampleDetail } from '@/components/ai/eval-sample-detail';
import { ABComparison } from '@/components/ai/ab-comparison';
import { Bot, FlaskConical, Plus } from 'lucide-react';

const METRIC_OPTIONS = [
  { key: 'relevancy', label: 'Relevancy' },
  { key: 'faithfulness', label: 'Faithfulness' },
  { key: 'coherence', label: 'Coherence' },
  { key: 'toxicity', label: 'Toxicity' },
];

export default function EvaluationPage() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['relevancy', 'faithfulness']);

  // Live eval data from API + demo fallback
  const demoJobs = useCallback(() => getEvalJobs(), []);
  const { data: jobsData, source } = useDataSource('/genai/evals', demoJobs, { refreshInterval: 30_000 });
  const jobs = Array.isArray(jobsData) ? jobsData : (jobsData as any)?.items ?? getEvalJobs();
  const abTests = useMemo(() => getABTests(), []);
  const expandedSamples = useMemo(
    () => (expandedJobId ? getEvalSamples(expandedJobId) : []),
    [expandedJobId],
  );

  const handleJobClick = (jobId: string) => {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  };

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  };

  // KPI calculations
  const totalEvals = jobs.length;
  const avgQuality = jobs.filter((j) => j.aggregateScores.length > 0).length > 0
    ? (
        jobs
          .filter((j) => j.aggregateScores.length > 0)
          .reduce(
            (sum, j) =>
              sum + j.aggregateScores.reduce((s, m) => s + m.score, 0) / j.aggregateScores.length,
            0,
          ) / jobs.filter((j) => j.aggregateScores.length > 0).length
      ).toFixed(2)
    : '0.00';
  const passRate = (() => {
    const withThreshold = jobs.flatMap((j) => j.aggregateScores.filter((s) => s.threshold));
    if (withThreshold.length === 0) return 78;
    const passed = withThreshold.filter((s) => s.score >= (s.threshold ?? 0)).length;
    return Math.round((passed / withThreshold.length) * 100);
  })();
  const runningCount = jobs.filter((j) => j.status === 'running').length;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
          { label: 'Evaluation', icon: <FlaskConical size={14} /> },
        ]}
      />

      <AISubNav />

      {/* Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">LLM Evaluation</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} />
          New Evaluation
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard helpId="eval-total" title="Total Evaluations" value={totalEvals} status="healthy" />
        <KPICard helpId="eval-avg-quality" title="Avg Quality" value={avgQuality} status="healthy" />
        <KPICard helpId="eval-pass-rate" title="Pass Rate" value={`${passRate}%`} status={passRate >= 80 ? 'healthy' : 'warning'} />
        <KPICard
          helpId="eval-running"
          title="Running"
          value={runningCount}
          status={runningCount > 0 ? 'warning' : 'healthy'}
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'jobs', label: 'Evaluation Jobs', count: jobs.length },
          { id: 'ab', label: 'A/B Tests', count: abTests.length },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === 'jobs' && (
        <Card padding="none">
          <EvalJobTable
            jobs={jobs}
            onJobClick={handleJobClick}
            expandedJobId={expandedJobId}
          />
          {expandedJobId && (
            <div className="border-t border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-medium text-[var(--text-primary)]">
                  Sample Results
                </h4>
                <Badge>{expandedSamples.length} samples</Badge>
              </div>
              <EvalSampleDetail samples={expandedSamples} />
            </div>
          )}
        </Card>
      )}

      {activeTab === 'ab' && (
        <div className="space-y-4">
          {abTests.map((test) => (
            <ABComparison key={test.id} test={test} />
          ))}
          {abTests.length === 0 && (
            <Card>
              <div className="text-center py-12 text-sm text-[var(--text-muted)]">
                No A/B tests found.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* New Evaluation Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Evaluation" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Name
            </label>
            <Input placeholder="e.g., RAG Quality Benchmark v4" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Model
              </label>
              <Select
                aria-label="Select model"
                options={[
                  { label: 'gpt-4o', value: 'gpt-4o' },
                  { label: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet' },
                  { label: 'llama-3-70b', value: 'llama-3-70b' },
                ]}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Judge Model
              </label>
              <Select
                aria-label="Select judge model"
                options={[
                  { label: 'gpt-4o', value: 'gpt-4o' },
                  { label: 'claude-3.5-sonnet', value: 'claude-3.5-sonnet' },
                  { label: 'llama-3-70b', value: 'llama-3-70b' },
                ]}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Dataset
            </label>
            <Select
              aria-label="Select dataset"
              options={[
                { label: 'qa-finance-500', value: 'qa-finance-500' },
                { label: 'code-review-200', value: 'code-review-200' },
                { label: 'news-articles-300', value: 'news-articles-300' },
              ]}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Metrics
            </label>
            <div className="flex flex-wrap gap-2">
              {METRIC_OPTIONS.map((opt) => {
                const checked = selectedMetrics.includes(opt.key);
                return (
                  <label
                    key={opt.key}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[var(--radius-md)] cursor-pointer border transition-colors',
                      checked
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                        : 'border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-emphasis)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMetric(opt.key)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        'w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[10px]',
                        checked
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                          : 'border-[var(--border-default)]',
                      )}
                    >
                      {checked && '\u2713'}
                    </span>
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--border-default)]">
            <Button onClick={() => setModalOpen(false)}>
              Start Evaluation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
