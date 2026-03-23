'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui';
import { CheckCircle2 } from 'lucide-react';
import type { CostRecommendation } from '@/types/monitoring';

interface CostRecommendationCardProps {
  recommendation: CostRecommendation;
}

const priorityStyles: Record<CostRecommendation['priority'], string> = {
  high: 'bg-[var(--status-critical-bg)] text-[var(--status-critical)]',
  medium: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
  low: 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
};

const categoryLabels: Record<CostRecommendation['category'], string> = {
  model_switch: 'Model Switch',
  cache: 'Cache',
  token_reduction: 'Token Reduction',
  batch: 'Batch',
  routing: 'Routing',
};

const effortStyles: Record<CostRecommendation['effort'], { label: string; color: string }> = {
  low: { label: 'Low Effort', color: 'text-[var(--status-healthy)]' },
  medium: { label: 'Medium Effort', color: 'text-[var(--status-warning)]' },
  high: { label: 'High Effort', color: 'text-[var(--status-critical)]' },
};

export function CostRecommendationCard({ recommendation }: CostRecommendationCardProps) {
  const { priority, category, title, description, currentCost, estimatedSaving, effort, implemented } = recommendation;
  const delta = ((estimatedSaving / currentCost) * 100).toFixed(0);

  return (
    <Card className={cn('relative', implemented && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          {/* Priority badge + category */}
          <div className="flex items-center gap-2">
            <span className={cn('px-2 py-0.5 text-[10px] font-semibold uppercase rounded-[var(--radius-full)]', priorityStyles[priority])}>
              {priority}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">
              {categoryLabels[category]}
            </span>
          </div>

          {/* Title + description */}
          <div>
            <h4 className="text-sm font-medium text-[var(--text-primary)]">{title}</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{description}</p>
          </div>

          {/* Cost row */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[var(--text-muted)]">
              Current: <span className="text-[var(--text-primary)] font-medium">${currentCost.toFixed(2)}/day</span>
            </span>
            <span className="text-[var(--text-muted)]">&rarr;</span>
            <span className="text-[var(--status-healthy)] font-medium">
              Save ${estimatedSaving.toFixed(2)}/day
            </span>
            <span className="text-[var(--status-healthy)] text-[10px]">
              (-{delta}%)
            </span>
          </div>

          {/* Effort */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-muted)]">Effort:</span>
            <span className={cn('font-medium', effortStyles[effort].color)}>
              {effortStyles[effort].label}
            </span>
          </div>
        </div>

        {/* Implemented checkmark */}
        {implemented && (
          <div className="flex items-center gap-1 text-[var(--status-healthy)] shrink-0">
            <CheckCircle2 size={16} />
            <span className="text-[10px] font-medium">Implemented</span>
          </div>
        )}
      </div>
    </Card>
  );
}
