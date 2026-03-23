'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { EvalSample } from '@/types/monitoring';

interface EvalSampleDetailProps {
  samples: EvalSample[];
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'text-[var(--status-healthy)]';
  if (score >= 0.6) return 'text-[var(--status-warning)]';
  return 'text-[var(--status-critical)]';
}

function scoreBg(score: number): string {
  if (score >= 0.8) return 'bg-[var(--status-healthy)]';
  if (score >= 0.6) return 'bg-[var(--status-warning)]';
  return 'bg-[var(--status-critical)]';
}

function getMetricScore(sample: EvalSample, metric: string): number | null {
  const found = sample.scores.find((s) => s.metric === metric);
  return found ? found.score : null;
}

export function EvalSampleDetail({ samples }: EvalSampleDetailProps) {
  if (samples.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        No samples available.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
            <th className="text-left py-2 px-3 font-medium">Prompt</th>
            <th className="text-left py-2 px-3 font-medium">Response</th>
            <th className="text-center py-2 px-3 font-medium">Relevancy</th>
            <th className="text-center py-2 px-3 font-medium">Faithfulness</th>
            <th className="text-center py-2 px-3 font-medium">Coherence</th>
            <th className="text-right py-2 px-3 font-medium">Tokens</th>
            <th className="text-right py-2 px-3 font-medium">Latency</th>
            <th className="text-center py-2 px-3 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => {
            const relevancy = getMetricScore(sample, 'relevancy');
            const faithfulness = getMetricScore(sample, 'faithfulness');
            const coherence = getMetricScore(sample, 'coherence');

            return (
              <tr
                key={sample.id}
                className="border-b border-[var(--border-default)] hover:bg-[var(--bg-tertiary)]/50 transition-colors"
              >
                <td className="py-2 px-3 text-[var(--text-primary)] max-w-[200px]" title={sample.prompt}>
                  {truncate(sample.prompt, 60)}
                </td>
                <td className="py-2 px-3 text-[var(--text-secondary)] max-w-[200px]" title={sample.response}>
                  {truncate(sample.response, 60)}
                </td>
                <td className="py-2 px-3 text-center">
                  {relevancy !== null ? (
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          scoreBg(relevancy),
                        )}
                      />
                      <span className={cn('tabular-nums font-medium', scoreColor(relevancy))}>
                        {relevancy.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  {faithfulness !== null ? (
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          scoreBg(faithfulness),
                        )}
                      />
                      <span className={cn('tabular-nums font-medium', scoreColor(faithfulness))}>
                        {faithfulness.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  {coherence !== null ? (
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          scoreBg(coherence),
                        )}
                      />
                      <span className={cn('tabular-nums font-medium', scoreColor(coherence))}>
                        {coherence.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">-</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                  {sample.tokenCount.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                  {sample.latencyMs >= 1000
                    ? `${(sample.latencyMs / 1000).toFixed(1)}s`
                    : `${sample.latencyMs}ms`}
                </td>
                <td className="py-2 px-3 text-center">
                  <Badge
                    variant="status"
                    status={sample.pass ? 'healthy' : 'critical'}
                  >
                    {sample.pass ? 'Pass' : 'Fail'}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
