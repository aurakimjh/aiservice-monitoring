'use client';

import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DeployRequest, DeployStrategy } from '@/types/monitoring';
import {
  Rocket,
  Layers,
  CalendarClock,
  Users,
  Tag,
  Server,
  AlertTriangle,
} from 'lucide-react';

interface DeployStrategyModalProps {
  open: boolean;
  pluginName: string;
  onClose: () => void;
  onDeploy: (request: DeployRequest) => void;
}

const STRATEGIES: { id: DeployStrategy; label: string; description: string; icon: typeof Rocket }[] = [
  {
    id: 'immediate',
    label: 'Immediate',
    description: 'Deploy to all target agents at once',
    icon: Rocket,
  },
  {
    id: 'staged',
    label: 'Staged',
    description: 'Canary first, then gradual rollout by percentage',
    icon: Layers,
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    description: 'Deploy at a specific date and time',
    icon: CalendarClock,
  },
];

const TARGET_TYPES: { id: 'group' | 'tag' | 'agents'; label: string; icon: typeof Users }[] = [
  { id: 'group', label: 'Group', icon: Users },
  { id: 'tag', label: 'Tag', icon: Tag },
  { id: 'agents', label: 'Individual Agents', icon: Server },
];

export function DeployStrategyModal({ open, pluginName, onClose, onDeploy }: DeployStrategyModalProps) {
  const [strategy, setStrategy] = useState<DeployStrategy>('immediate');
  const [targetType, setTargetType] = useState<'group' | 'tag' | 'agents'>('group');
  const [targetValue, setTargetValue] = useState('production');
  const [canaryCount, setCanaryCount] = useState(2);
  const [stages, setStages] = useState('10,50,100');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDeploy = useCallback(() => {
    setSubmitting(true);

    const request: DeployRequest = {
      target: {
        type: targetType,
        value: targetType === 'agents'
          ? targetValue.split(',').map(s => s.trim())
          : targetValue,
      },
      strategy,
    };

    if (strategy === 'staged') {
      request.staged_config = {
        canary_count: canaryCount,
        stages: stages.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
      };
    }

    if (strategy === 'scheduled' && scheduledAt) {
      request.scheduled_at = new Date(scheduledAt).toISOString();
    }

    // Simulate API call delay.
    setTimeout(() => {
      onDeploy(request);
      setSubmitting(false);
    }, 500);
  }, [strategy, targetType, targetValue, canaryCount, stages, scheduledAt, onDeploy]);

  return (
    <Modal open={open} onClose={onClose} title={`Deploy: ${pluginName}`} size="lg">
      <div className="space-y-6">
        {/* Strategy Selection */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Deploy Strategy
          </label>
          <div className="grid grid-cols-3 gap-3">
            {STRATEGIES.map(s => {
              const Icon = s.icon;
              const isSelected = strategy === s.id;
              return (
                <button
                  key={s.id}
                  className="p-3 rounded-lg border text-left transition-colors"
                  style={{
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)',
                    background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  }}
                  onClick={() => setStrategy(s.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    <span
                      className="text-xs font-medium"
                      style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {s.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Selection */}
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Target
          </label>
          <div className="flex gap-2 mb-3">
            {TARGET_TYPES.map(t => {
              const Icon = t.icon;
              const isSelected = targetType === t.id;
              return (
                <button
                  key={t.id}
                  className="px-3 py-1.5 rounded text-xs border transition-colors flex items-center gap-1.5"
                  style={{
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)',
                    background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}
                  onClick={() => setTargetType(t.id)}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <Input
            value={targetValue}
            onChange={e => setTargetValue(e.target.value)}
            placeholder={
              targetType === 'group' ? 'Group name (e.g. production)'
                : targetType === 'tag' ? 'Tag value (e.g. gpu-cluster)'
                : 'Comma-separated agent IDs'
            }
          />
        </div>

        {/* Staged Config */}
        {strategy === 'staged' && (
          <div className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            <h4 className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Staged Rollout Configuration
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                  Canary Count
                </label>
                <Input
                  type="number"
                  value={canaryCount}
                  onChange={e => setCanaryCount(parseInt(e.target.value, 10) || 1)}
                  min={1}
                  max={10}
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                  Stage Percentages (comma-separated)
                </label>
                <Input
                  value={stages}
                  onChange={e => setStages(e.target.value)}
                  placeholder="10,50,100"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <AlertTriangle size={10} />
              Auto-rollback triggers if failure rate exceeds 50%
            </div>
          </div>
        )}

        {/* Scheduled Config */}
        {strategy === 'scheduled' && (
          <div className="space-y-3 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
            <h4 className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Schedule
            </h4>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              The deploy will execute as an immediate deploy at the scheduled time
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleDeploy}
            disabled={submitting || !targetValue}
          >
            {submitting ? (
              <>Deploying...</>
            ) : (
              <>
                <Rocket size={13} className="mr-1" />
                Deploy {strategy === 'scheduled' ? '(Schedule)' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
