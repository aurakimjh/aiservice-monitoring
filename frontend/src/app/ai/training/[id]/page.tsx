'use client';

import { useState, use, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
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
  ArrowLeft,
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

export default function TrainingJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const demoJobs = useCallback(() => getTrainingJobs(), []);
  const { data: jobsResult, source } = useDataSource(`/genai/training/${id}`, demoJobs, { refreshInterval: 30_000 });
  const jobs = Array.isArray(jobsResult) ? jobsResult : (jobsResult as any)?.items ?? getTrainingJobs();
  const job = jobs.find((j: any) => j.id === id);

  const lossCurve = useMemo(() => getTrainingLossCurve(id), [id]);
  const accCurve = useMemo(() => getTrainingAccuracyCurve(id), [id]);
  const checkpoints = useMemo(() => getTrainingCheckpoints(id), [id]);

  // Generate GPU utilization timeline data
  const gpuUtilData = useMemo(() => {
    if (!job) return [];
    const now = Date.now();
    const points: [number, number][] = [];
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = now - (steps - i) * 60000;
      const base = job.gpuUtilization > 0 ? job.gpuUtilization : 50;
      const jitter = (Math.random() - 0.5) * 10;
      points.push([t, Math.max(0, Math.min(100, base + jitter))]);
    }
    return points;
  }, [job]);

  // Generate learning rate schedule data
  const lrScheduleData = useMemo(() => {
    if (!job) return [];
    const points: [number, number][] = [];
    const totalSteps = job.totalSteps || 5000;
    const baseLR = job.learningRate;
    for (let i = 0; i <= totalSteps; i += Math.max(1, Math.floor(totalSteps / 60))) {
      const t = i / totalSteps;
      // Warmup + cosine decay schedule
      let lr: number;
      if (t < 0.1) {
        lr = baseLR * (t / 0.1);
      } else {
        lr = baseLR * 0.5 * (1 + Math.cos(Math.PI * (t - 0.1) / 0.9));
      }
      points.push([i, lr]);
    }
    return points;
  }, [job]);

  if (!job) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
            { label: 'Training', href: '/ai/training', icon: <GraduationCap size={14} /> },
            { label: 'Not Found' },
          ]}
        />
        <AISubNav />
        <Card>
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">
            Training job not found. <Link href="/ai/training" className="text-[var(--accent-primary)] hover:underline">Back to Training</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Services', href: '/ai', icon: <Bot size={14} /> },
          { label: 'Training', href: '/ai/training', icon: <GraduationCap size={14} /> },
          { label: job.name },
        ]}
      />

      <AISubNav />

      {/* Back link */}
      <Link
        href="/ai/training"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors"
      >
        <ArrowLeft size={12} />
        Back to Training Jobs
      </Link>

      {/* Job Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-[var(--accent-primary)]" />
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{job.name}</h1>
            <DataSourceBadge source={source} />
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border',
                STATUS_COLORS[job.status],
              )}
            >
              {STATUS_ICONS[job.status]}
              {job.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <Database size={11} />
              Base: {job.baseModel}
            </span>
            <span className="flex items-center gap-1">
              <Database size={11} />
              Dataset: {job.dataset}
            </span>
            {job.startedAt > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Started {getRelativeTime(new Date(job.startedAt))}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EpochProgress current={job.currentEpoch} total={job.totalEpochs} />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          helpId="training-val-loss"
          title="Val Loss"
          value={job.valLoss > 0 ? job.valLoss.toFixed(3) : '—'}
          subtitle={`Train: ${job.trainLoss > 0 ? job.trainLoss.toFixed(3) : '—'}`}
          status={job.valLoss > 0 && job.valLoss < 0.3 ? 'healthy' : job.valLoss < 0.5 ? 'warning' : 'critical'}
        />
        <KPICard
          helpId="training-val-accuracy"
          title="Val Accuracy"
          value={job.valAccuracy > 0 ? job.valAccuracy.toFixed(1) : '—'}
          unit="%"
          subtitle={`Train: ${job.trainAccuracy > 0 ? `${job.trainAccuracy.toFixed(1)}%` : '—'}`}
          status={job.valAccuracy > 90 ? 'healthy' : job.valAccuracy > 80 ? 'warning' : 'critical'}
        />
        <KPICard
          helpId="training-gpu-util"
          title="GPU Utilization"
          value={job.gpuUtilization > 0 ? job.gpuUtilization : '—'}
          unit={job.gpuUtilization > 0 ? '%' : undefined}
          subtitle={`${job.gpuIds.length} GPU(s) assigned`}
          status={job.gpuUtilization > 90 ? 'critical' : job.gpuUtilization > 75 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="training-throughput"
          title="Throughput"
          value={job.tokensPerSecond > 0 ? job.tokensPerSecond.toLocaleString() : '—'}
          unit={job.tokensPerSecond > 0 ? 'tok/s' : undefined}
          subtitle={`Step ${job.currentStep.toLocaleString()} / ${job.totalSteps.toLocaleString()}`}
        />
      </div>

      {/* 2x2 Chart Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Train Loss + Val Loss */}
        <Card>
          <CardHeader>
            <CardTitle>Loss Curve</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              {
                name: 'Train Loss',
                data: lossCurve.map(([step, val]) => [step, val]),
                color: '#F85149',
              },
              {
                name: 'Val Loss',
                data: lossCurve.map(([step, val]) => [step, val * (1.05 + Math.random() * 0.1)]),
                color: '#D29922',
                dashStyle: true,
              },
            ]}
            height={220}
            yAxisLabel="Loss"
          />
        </Card>

        {/* Train Accuracy + Val Accuracy */}
        <Card>
          <CardHeader>
            <CardTitle>Accuracy Curve</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              {
                name: 'Train Accuracy',
                data: accCurve.map(([step, val]) => [step, val]),
                color: '#58A6FF',
              },
              {
                name: 'Val Accuracy',
                data: accCurve.map(([step, val]) => [step, Math.max(0, val - 2 - Math.random() * 1.5)]),
                color: '#79C0FF',
                dashStyle: true,
              },
            ]}
            height={220}
            yAxisLabel="Accuracy (%)"
          />
        </Card>

        {/* GPU Utilization Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>GPU Utilization</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              {
                name: 'GPU Utilization',
                data: gpuUtilData,
                color: '#BC8CFF',
                type: 'area',
              },
            ]}
            height={220}
            yAxisLabel="Utilization (%)"
            thresholdLine={{ value: 90, label: 'Threshold 90%', color: '#F85149' }}
          />
        </Card>

        {/* Learning Rate Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Learning Rate Schedule</CardTitle>
          </CardHeader>
          <TimeSeriesChart
            series={[
              {
                name: 'Learning Rate',
                data: lrScheduleData,
                color: '#3FB950',
              },
            ]}
            height={220}
            yAxisLabel="LR"
          />
        </Card>
      </div>

      {/* Checkpoint List */}
      <Card padding="none">
        <CardHeader>
          <CardTitle>Checkpoints ({checkpoints.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)] text-left">
                <th className="px-4 py-2.5 font-medium text-right">Epoch</th>
                <th className="px-4 py-2.5 font-medium text-right">Step</th>
                <th className="px-4 py-2.5 font-medium text-right">Train Loss</th>
                <th className="px-4 py-2.5 font-medium text-right">Val Loss</th>
                <th className="px-4 py-2.5 font-medium text-right">Accuracy</th>
                <th className="px-4 py-2.5 font-medium text-right">Size</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Deployed</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp) => (
                <tr
                  key={cp.id}
                  className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
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
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">
                    {getRelativeTime(new Date(cp.createdAt))}
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
        {checkpoints.length === 0 && (
          <div className="text-center py-12 text-sm text-[var(--text-muted)]">
            No checkpoints saved for this job.
          </div>
        )}
      </Card>
    </div>
  );
}
