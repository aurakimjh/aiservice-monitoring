'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Tabs, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { KPICard } from '@/components/monitoring';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { AISubNav } from '@/components/ai';
import { EpochProgress } from '@/components/ai/epoch-progress';
import {
  getTrainingJobs,
  getTrainingLossCurve,
  getTrainingAccuracyCurve,
  getTrainingCheckpoints,
  getTrainVsInference,
} from '@/lib/demo-data';
import { getRelativeTime, formatBytes } from '@/lib/utils';
import {
  GraduationCap,
  Cpu,
  Brain,
  Database,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Play,
  Bot,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-[#3FB950]/15 text-[#3FB950] border-[#3FB950]/30',
  completed: 'bg-[#58A6FF]/15 text-[#58A6FF] border-[#58A6FF]/30',
  failed: 'bg-[#F85149]/15 text-[#F85149] border-[#F85149]/30',
  queued: 'bg-[#8B949E]/15 text-[#8B949E] border-[#8B949E]/30',
  paused: 'bg-[#D29922]/15 text-[#D29922] border-[#D29922]/30',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Loader2 size={12} className="animate-spin" />,
  completed: <CheckCircle size={12} />,
  failed: <XCircle size={12} />,
  queued: <Clock size={12} />,
  paused: <Clock size={12} />,
};

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const demoJobs = useCallback(() => getTrainingJobs(), []);
  const { data: jobsResult, source } = useDataSource('/genai/training/jobs', demoJobs, { refreshInterval: 30_000 });
  const jobs = Array.isArray(jobsResult) ? jobsResult : (jobsResult as any)?.items ?? getTrainingJobs();
  const checkpoints = useMemo(
    () => (expandedJobId ? getTrainingCheckpoints(expandedJobId) : []),
    [expandedJobId],
  );
  const trainVsInference = useMemo(() => getTrainVsInference(), []);

  // Expand inline charts data
  const expandedLossCurve = useMemo(
    () => (expandedJobId ? getTrainingLossCurve(expandedJobId) : []),
    [expandedJobId],
  );
  const expandedAccCurve = useMemo(
    () => (expandedJobId ? getTrainingAccuracyCurve(expandedJobId) : []),
    [expandedJobId],
  );

  // KPI calculations
  const activeJobs = jobs.filter((j) => j.status === 'running').length;
  const avgGpu =
    jobs.filter((j) => j.gpuUtilization > 0).length > 0
      ? Math.round(
          jobs
            .filter((j) => j.gpuUtilization > 0)
            .reduce((s, j) => s + j.gpuUtilization, 0) /
            jobs.filter((j) => j.gpuUtilization > 0).length,
        )
      : 0;
  const bestLoss = Math.min(
    ...jobs.filter((j) => j.valLoss > 0).map((j) => j.valLoss),
  );
  const totalCheckpoints = jobs.reduce(
    (sum, j) => sum + getTrainingCheckpoints(j.id).length,
    0,
  );

  const handleJobClick = (jobId: string) => {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  };

  // Global checkpoints for "Checkpoints" tab — show all jobs
  const allCheckpoints = useMemo(
    () =>
      jobs.flatMap((job) =>
        getTrainingCheckpoints(job.id).map((cp) => ({
          ...cp,
          jobName: job.name,
        })),
      ),
    [jobs],
  );

  const tabs = [
    { id: 'jobs', label: 'Jobs', count: jobs.length },
    { id: 'checkpoints', label: 'Checkpoints', count: totalCheckpoints },
    { id: 'comparison', label: 'Comparison' },
  ];

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
          { label: 'Training', icon: <GraduationCap size={14} /> },
        ]}
      />

      <AISubNav />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Fine-tuning Monitoring
          </h1>
          <DataSourceBadge source={source} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          helpId="training-active-jobs"
          title="Active Jobs"
          value={activeJobs}
          subtitle={`${jobs.length} total jobs`}
          status={activeJobs > 0 ? 'healthy' : 'warning'}
          sparkData={[1, 2, 2, 3, 2, 3, 2, 2, 3, activeJobs]}
        />
        <KPICard
          helpId="training-avg-gpu"
          title="Avg GPU Utilization"
          value={avgGpu}
          unit="%"
          subtitle="Active training GPUs"
          status={avgGpu > 90 ? 'critical' : avgGpu > 75 ? 'warning' : 'healthy'}
          sparkData={[80, 82, 85, 88, 90, 92, 91, 93, 94, avgGpu]}
        />
        <KPICard
          helpId="training-best-loss"
          title="Current Best Loss"
          value={bestLoss === Infinity ? '—' : bestLoss.toFixed(2)}
          subtitle="Validation loss"
          status={bestLoss < 0.3 ? 'healthy' : bestLoss < 0.5 ? 'warning' : 'critical'}
          sparkData={[1.2, 0.9, 0.7, 0.55, 0.48, 0.42, 0.38, 0.32, 0.28, bestLoss === Infinity ? 0 : bestLoss]}
        />
        <KPICard
          helpId="training-total-checkpoints"
          title="Total Checkpoints"
          value={totalCheckpoints}
          subtitle="Across all jobs"
          sparkData={[5, 8, 10, 12, 14, 16, 18, 20, 22, totalCheckpoints]}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Jobs Tab */}
      {activeTab === 'jobs' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Base Model</th>
                  <th className="px-4 py-2.5 font-medium">Dataset</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium text-right">Loss</th>
                  <th className="px-4 py-2.5 font-medium text-right">Accuracy</th>
                  <th className="px-4 py-2.5 font-medium text-right">GPU%</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <>
                    <tr
                      key={job.id}
                      className={cn(
                        'border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer',
                        expandedJobId === job.id && 'bg-[var(--bg-tertiary)]',
                      )}
                      onClick={() => handleJobClick(job.id)}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/ai/training/${job.id}`}
                          className="font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Brain size={12} className="text-[var(--text-muted)]" />
                          {job.name}
                        </Link>
                        {job.startedAt > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            Started {getRelativeTime(new Date(job.startedAt))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1">
                          <Database size={11} className="text-[var(--text-muted)]" />
                          {job.baseModel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-secondary)]">{job.dataset}</td>
                      <td className="px-4 py-2.5">
                        <EpochProgress current={job.currentEpoch} total={job.totalEpochs} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                        {job.valLoss > 0 ? job.valLoss.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                        {job.valAccuracy > 0 ? `${job.valAccuracy.toFixed(1)}%` : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right tabular-nums',
                          job.gpuUtilization > 90
                            ? 'text-[var(--status-warning)] font-medium'
                            : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {job.gpuUtilization > 0 ? `${job.gpuUtilization}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border',
                            STATUS_COLORS[job.status],
                          )}
                        >
                          {STATUS_ICONS[job.status]}
                          {job.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                    {expandedJobId === job.id && (
                      <tr key={`${job.id}-expanded`} className="border-b border-[var(--border-muted)]">
                        <td colSpan={8} className="px-4 py-4 bg-[var(--bg-primary)]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                                Loss Curve
                              </h4>
                              <TimeSeriesChart
                                series={[
                                  {
                                    name: 'Train Loss',
                                    data: expandedLossCurve.map(([step, val]) => [step, val]),
                                    color: '#F85149',
                                  },
                                ]}
                                height={180}
                                yAxisLabel="Loss"
                              />
                            </div>
                            <div>
                              <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                                Accuracy Curve
                              </h4>
                              <TimeSeriesChart
                                series={[
                                  {
                                    name: 'Train Accuracy',
                                    data: expandedAccCurve.map(([step, val]) => [step, val]),
                                    color: '#58A6FF',
                                  },
                                ]}
                                height={180}
                                yAxisLabel="Accuracy (%)"
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-muted)]">
                            <span>LR: {job.learningRate}</span>
                            <span>Batch: {job.batchSize}</span>
                            <span>GPUs: {job.gpuIds.length}</span>
                            <span>Speed: {job.tokensPerSecond > 0 ? `${job.tokensPerSecond} tok/s` : '—'}</span>
                            {job.estimatedTimeRemaining && job.estimatedTimeRemaining > 0 && (
                              <span>
                                ETA: {Math.round(job.estimatedTimeRemaining / 60)} min
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {jobs.length === 0 && (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              No training jobs found.
            </div>
          )}
        </Card>
      )}

      {/* Checkpoints Tab */}
      {activeTab === 'checkpoints' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Job</th>
                  <th className="px-4 py-2.5 font-medium text-right">Epoch</th>
                  <th className="px-4 py-2.5 font-medium text-right">Step</th>
                  <th className="px-4 py-2.5 font-medium text-right">Train Loss</th>
                  <th className="px-4 py-2.5 font-medium text-right">Val Loss</th>
                  <th className="px-4 py-2.5 font-medium text-right">Accuracy</th>
                  <th className="px-4 py-2.5 font-medium text-right">Size</th>
                  <th className="px-4 py-2.5 font-medium">Deployed</th>
                </tr>
              </thead>
              <tbody>
                {allCheckpoints.map((cp) => (
                  <tr
                    key={cp.id}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {cp.jobName}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {cp.epoch}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {cp.step.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {cp.trainLoss.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {cp.valLoss.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {cp.valAccuracy.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {formatBytes(cp.sizeBytes)}
                    </td>
                    <td className="px-4 py-2.5">
                      {cp.deployed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#3FB950]/15 text-[#3FB950] border border-[#3FB950]/30">
                          <CheckCircle size={10} />
                          DEPLOYED
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allCheckpoints.length === 0 && (
            <div className="text-center py-12 text-sm text-[var(--text-muted)]">
              No checkpoints saved yet.
            </div>
          )}
        </Card>
      )}

      {/* Comparison Tab */}
      {activeTab === 'comparison' && (
        <Card padding="none">
          <CardHeader>
            <CardTitle>Train vs Inference Comparison</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                  <th className="px-4 py-2.5 font-medium">Metric</th>
                  <th className="px-4 py-2.5 font-medium text-right">Training</th>
                  <th className="px-4 py-2.5 font-medium text-right">Inference</th>
                  <th className="px-4 py-2.5 font-medium text-right">Unit</th>
                  <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {trainVsInference.map((row) => (
                  <tr
                    key={row.metric}
                    className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">
                      {row.metric}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {row.trainValue > 0 ? row.trainValue.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {row.inferenceValue > 0 ? row.inferenceValue.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-muted)]">
                      {row.unit || '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2.5 text-right tabular-nums font-medium',
                        row.delta > 0
                          ? 'text-[#3FB950]'
                          : row.delta < 0
                            ? 'text-[#F85149]'
                            : 'text-[var(--text-muted)]',
                      )}
                    >
                      {row.delta > 0 ? '+' : ''}
                      {row.delta !== 0 ? `${row.delta.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
