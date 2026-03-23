'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui';
import { Button } from '@/components/ui';
import { X } from 'lucide-react';
import type { PromptVersion } from '@/types/monitoring';

interface VersionDiffProps {
  versionA: PromptVersion;
  versionB: PromptVersion;
  onClose: () => void;
}

export function VersionDiff({ versionA, versionB, onClose }: VersionDiffProps) {
  return (
    <Card className="border-[var(--accent-primary)]/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Version Comparison
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close diff">
          <X size={16} />
        </Button>
      </div>

      {/* Side-by-side columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Version A */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--accent-primary)]">
              Version {versionA.version}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{versionA.author}</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              System Prompt
            </label>
            <div className={cn(
              'rounded-[var(--radius-md)] p-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap',
              'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
              'text-[var(--text-primary)]',
            )}>
              {versionA.systemPrompt}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              User Template
            </label>
            <div className={cn(
              'rounded-[var(--radius-md)] p-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap',
              'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
              'text-[var(--text-primary)]',
            )}>
              {versionA.userTemplate}
            </div>
          </div>
        </div>

        {/* Version B */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--accent-primary)]">
              Version {versionB.version}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">{versionB.author}</span>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              System Prompt
            </label>
            <div className={cn(
              'rounded-[var(--radius-md)] p-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap',
              'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
              'text-[var(--text-primary)]',
            )}>
              {versionB.systemPrompt}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider">
              User Template
            </label>
            <div className={cn(
              'rounded-[var(--radius-md)] p-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap',
              'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
              'text-[var(--text-primary)]',
            )}>
              {versionB.userTemplate}
            </div>
          </div>
        </div>
      </div>

      {/* Performance comparison */}
      <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
        <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">Performance Comparison</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Metric</div>
            <div className="text-[10px] text-[var(--text-muted)]">v{versionA.version} / v{versionB.version}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Latency</div>
            <div className="text-xs tabular-nums text-[var(--text-primary)]">
              {versionA.performance.avgLatencyMs}ms / {versionB.performance.avgLatencyMs}ms
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Quality</div>
            <div className="text-xs tabular-nums text-[var(--text-primary)]">
              {versionA.performance.avgQualityScore.toFixed(2)} / {versionB.performance.avgQualityScore.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-[var(--text-muted)] mb-0.5">Tokens</div>
            <div className="text-xs tabular-nums text-[var(--text-primary)]">
              {versionA.performance.avgTokens} / {versionB.performance.avgTokens}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
