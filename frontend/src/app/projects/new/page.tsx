'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Button, Input, Select } from '@/components/ui';
import { useProjectStore } from '@/stores/project-store';
import { FolderOpen, Check, ArrowRight, ArrowLeft, Info, Server, Bell, Cpu } from 'lucide-react';
import type { Environment } from '@/types/monitoring';

const STEPS = [
  { id: 1, label: 'Basic Info', icon: <Info size={14} /> },
  { id: 2, label: 'Resources', icon: <Server size={14} /> },
  { id: 3, label: 'Alerts', icon: <Bell size={14} /> },
  { id: 4, label: 'Agent', icon: <Cpu size={14} /> },
];

const ENV_OPTIONS = [
  { label: 'Production', value: 'production' },
  { label: 'Staging', value: 'staging' },
  { label: 'Development', value: 'development' },
];

export default function NewProjectPage() {
  const router = useRouter();
  const addProject = useProjectStore((s) => s.addProject);
  const [step, setStep] = useState(1);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [tags, setTags] = useState('');

  // Step 2
  const [hostGroupName, setHostGroupName] = useState('');
  const [enableAI, setEnableAI] = useState(false);

  // Step 3
  const [slackChannel, setSlackChannel] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');

  const canNext = () => {
    if (step === 1) return name.trim().length > 0;
    return true;
  };

  const handleCreate = () => {
    const id = `proj-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
    addProject({
      id,
      name: name.trim(),
      description: description.trim(),
      environment,
      tags: tags
        .split(',')
        .filter(Boolean)
        .reduce((acc, t) => {
          const [k, v] = t.trim().split(':');
          if (k) acc[k.trim()] = v?.trim() ?? '';
          return acc;
        }, {} as Record<string, string>),
      hostCount: 0,
      serviceCount: 0,
      aiServiceCount: 0,
      alertCount: 0,
      errorRate: 0,
      p95Latency: 0,
      sloCompliance: 100,
      status: 'healthy',
      lastActivity: new Date().toISOString(),
    });
    router.push(`/projects/${id}`);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Projects', href: '/projects', icon: <FolderOpen size={14} /> },
        { label: 'New Project' },
      ]} />

      <h1 className="text-lg font-semibold text-[var(--text-primary)]">Create New Project</h1>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            {i > 0 && <div className={cn('w-8 h-px', step > i ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-default)]')} />}
            <div
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-medium',
                step === s.id
                  ? 'bg-[var(--accent-primary)] text-white'
                  : step > s.id
                    ? 'bg-[var(--status-healthy-bg)] text-[var(--status-healthy)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
              )}
            >
              {step > s.id ? <Check size={12} /> : s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card padding="lg">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Basic Information</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Project Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI-Production" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this project" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Environment</label>
              <Select options={ENV_OPTIONS} value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Tags</label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="team:ai, region:kr (comma separated)" />
              <p className="text-[10px] text-[var(--text-muted)]">Format: key:value, separated by commas</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Resource Registration</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Register host groups and configure middleware types. Hosts can be auto-detected by installed agents.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Host Group Name</label>
              <Input value={hostGroupName} onChange={(e) => setHostGroupName(e.target.value)} placeholder="e.g. AI Inference Servers" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Middleware Types</label>
              <div className="flex flex-wrap gap-2">
                {['WEB', 'WAS', 'DB'].map((mw) => (
                  <label key={mw} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-xs cursor-pointer hover:bg-[var(--bg-overlay)]">
                    <input type="checkbox" defaultChecked className="accent-[var(--accent-primary)]" />
                    {mw}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-xs cursor-pointer hover:bg-[var(--bg-overlay)]">
                  <input type="checkbox" checked={enableAI} onChange={(e) => setEnableAI(e.target.checked)} className="accent-[var(--accent-primary)]" />
                  AI (LLM/GPU/VectorDB)
                </label>
              </div>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-info-bg)] text-xs text-[var(--status-info)]">
              Hosts will be auto-detected when AITOP agents are installed. You can also add hosts manually later.
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Alert Configuration</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Default alert templates will be applied. You can customize thresholds after creation.
            </p>
            <div className="space-y-3">
              <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-default)]">
                <div className="text-xs font-medium text-[var(--text-primary)] mb-1">Default Alert Rules</div>
                <div className="text-[11px] text-[var(--text-muted)] space-y-0.5">
                  <div>LLM_TTFT_High — TTFT P95 &gt; 2,000ms for 5m</div>
                  <div>GPU_VRAM_Critical — VRAM &gt; 90% for 3m</div>
                  <div>Error_Rate_High — Error rate &gt; 1% for 5m</div>
                  <div>P95_Latency_High — P95 &gt; 3,000ms for 5m</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Slack Channel</label>
                <Input value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} placeholder="#alerts-ai-prod" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Email Notification</label>
                <Input value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} placeholder="sre-team@company.com" />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Agent Connection</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Install AITOP agents on your hosts to start collecting metrics. This step is optional — you can connect agents later.
            </p>
            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--bg-tertiary)] border border-[var(--border-default)] space-y-3">
              <div className="text-xs font-medium text-[var(--text-primary)]">Agent Install Command</div>
              <code className="block p-2 rounded bg-[var(--bg-primary)] text-[11px] text-[var(--chart-2)] font-mono overflow-x-auto">
                curl -sSL https://install.aitop.io | bash -s -- --project=NEW_PROJECT --token=&lt;auto-generated&gt;
              </code>
              <p className="text-[10px] text-[var(--text-muted)]">
                Token will be generated after project creation. Run this command on each host.
              </p>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-info-bg)] text-xs text-[var(--status-info)]">
              You can also use <strong>collect-only</strong> mode for one-time diagnostics without a persistent agent.
            </div>
          </div>
        )}
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="md"
          onClick={() => step > 1 ? setStep(step - 1) : router.push('/projects')}
        >
          <ArrowLeft size={14} />
          {step > 1 ? 'Back' : 'Cancel'}
        </Button>

        {step < 4 ? (
          <Button variant="primary" size="md" onClick={() => setStep(step + 1)} disabled={!canNext()}>
            Next
            <ArrowRight size={14} />
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={handleCreate} disabled={!name.trim()}>
            <Check size={14} />
            Create Project
          </Button>
        )}
      </div>
    </div>
  );
}
