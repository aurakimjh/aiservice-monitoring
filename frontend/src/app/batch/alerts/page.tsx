'use client';

import { useState, useMemo } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, Tabs, Button, Modal, Input, Select } from '@/components/ui';
import { getBatchAlertRules, getBatchAlertHistory, getBatchJobs } from '@/lib/demo-data';
import { getRelativeTime } from '@/lib/utils';
import type { BatchAlertRule, BatchAlertHistory } from '@/types/monitoring';
import {
  Timer,
  Bell,
  Plus,
  Pencil,
  Trash2,
  MessageSquare,
  Mail,
  Phone,
  Webhook,
  Shield,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

const CHANNEL_ICONS: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  slack: { icon: MessageSquare, label: 'Slack', color: '#E01E5A' },
  email: { icon: Mail, label: 'Email', color: '#58A6FF' },
  pagerduty: { icon: Phone, label: 'PagerDuty', color: '#06AC38' },
  webhook: { icon: Webhook, label: 'Webhook', color: '#D29922' },
};

function getChannelList(rule: BatchAlertRule): string[] {
  const channels: string[] = [];
  if (rule.channels.slack_webhook) channels.push('slack');
  if (rule.channels.email && rule.channels.email.length > 0) channels.push('email');
  if (rule.channels.pagerduty_key) channels.push('pagerduty');
  if (rule.channels.webhook_url) channels.push('webhook');
  return channels;
}

function getConditionText(rule: BatchAlertRule): string {
  const parts: string[] = [];
  if (rule.conditions.duration_threshold_min) {
    parts.push(`Duration > ${rule.conditions.duration_threshold_min}min`);
  }
  if (rule.conditions.failure_threshold) {
    parts.push(`Failures >= ${rule.conditions.failure_threshold}`);
  }
  if (rule.conditions.sla_deadline) {
    parts.push(`SLA Deadline: ${rule.conditions.sla_deadline}`);
  }
  if (rule.conditions.cpu_threshold) {
    parts.push(`CPU > ${rule.conditions.cpu_threshold}%`);
  }
  return parts.join(', ') || 'No conditions';
}

interface RuleFormData {
  name: string;
  target_job: string;
  duration_threshold_min: string;
  failure_threshold: string;
  sla_deadline: string;
  cpu_threshold: string;
  slack_webhook: string;
  email: string;
  pagerduty_key: string;
  webhook_url: string;
  cooldown_min: string;
}

const EMPTY_FORM: RuleFormData = {
  name: '',
  target_job: '*',
  duration_threshold_min: '',
  failure_threshold: '',
  sla_deadline: '',
  cpu_threshold: '',
  slack_webhook: '',
  email: '',
  pagerduty_key: '',
  webhook_url: '',
  cooldown_min: '30',
};

export default function BatchAlertsPage() {
  const [rules, setRules] = useState(() => getBatchAlertRules());
  const alertHistory = useMemo(() => getBatchAlertHistory(), []);
  const jobs = useMemo(() => getBatchJobs(), []);

  const [activeTab, setActiveTab] = useState('rules');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BatchAlertRule | null>(null);
  const [form, setForm] = useState<RuleFormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const jobOptions = useMemo(() => [
    { label: 'All Jobs (*)', value: '*' },
    ...jobs.map(j => ({ label: j.name, value: j.name })),
  ], [jobs]);

  const handleCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const handleEdit = (rule: BatchAlertRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      target_job: rule.target_job,
      duration_threshold_min: rule.conditions.duration_threshold_min?.toString() || '',
      failure_threshold: rule.conditions.failure_threshold?.toString() || '',
      sla_deadline: rule.conditions.sla_deadline || '',
      cpu_threshold: rule.conditions.cpu_threshold?.toString() || '',
      slack_webhook: rule.channels.slack_webhook || '',
      email: rule.channels.email?.join(', ') || '',
      pagerduty_key: rule.channels.pagerduty_key || '',
      webhook_url: rule.channels.webhook_url || '',
      cooldown_min: rule.cooldown_min.toString(),
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    const newRule: BatchAlertRule = {
      id: editingRule?.id || `ba-rule-${Date.now()}`,
      name: form.name,
      target_job: form.target_job,
      enabled: editingRule?.enabled ?? true,
      conditions: {
        ...(form.duration_threshold_min ? { duration_threshold_min: parseInt(form.duration_threshold_min) } : {}),
        ...(form.failure_threshold ? { failure_threshold: parseInt(form.failure_threshold) } : {}),
        ...(form.sla_deadline ? { sla_deadline: form.sla_deadline } : {}),
        ...(form.cpu_threshold ? { cpu_threshold: parseInt(form.cpu_threshold) } : {}),
      },
      channels: {
        ...(form.slack_webhook ? { slack_webhook: form.slack_webhook } : {}),
        ...(form.email ? { email: form.email.split(',').map(e => e.trim()).filter(Boolean) } : {}),
        ...(form.pagerduty_key ? { pagerduty_key: form.pagerduty_key } : {}),
        ...(form.webhook_url ? { webhook_url: form.webhook_url } : {}),
      },
      cooldown_min: parseInt(form.cooldown_min) || 30,
      last_triggered_at: editingRule?.last_triggered_at,
      created_at: editingRule?.created_at || new Date().toISOString(),
    };

    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? newRule : r));
    } else {
      setRules(prev => [...prev, newRule]);
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    setDeleteConfirm(null);
  };

  const handleToggleEnabled = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const updateForm = (field: keyof RuleFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Batch Monitoring', href: '/batch', icon: <Timer size={14} /> },
        { label: 'Alert Rules', icon: <Bell size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Batch Alert Rules</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Configure alerts for batch job SLA breaches, failures, and performance issues
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus size={14} />
          Create Rule
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: 'rules', label: 'Alert Rules', count: rules.length },
          { id: 'history', label: 'Alert History', count: alertHistory.length },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Rule Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Target Job</th>
                  <th className="text-left px-4 py-2.5 font-medium">Conditions</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channels</th>
                  <th className="text-center px-4 py-2.5 font-medium">Enabled</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last Triggered</th>
                  <th className="text-center px-4 py-2.5 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => {
                  const channels = getChannelList(rule);
                  return (
                    <tr
                      key={rule.id}
                      className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-[var(--text-muted)]" />
                          <span className="font-medium text-[var(--text-primary)]">{rule.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono text-[var(--text-secondary)]">
                          {rule.target_job === '*' ? 'All Jobs' : rule.target_job}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {getConditionText(rule)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {channels.map(ch => {
                            const cfg = CHANNEL_ICONS[ch];
                            if (!cfg) return null;
                            const Icon = cfg.icon;
                            return (
                              <span
                                key={ch}
                                title={cfg.label}
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ backgroundColor: cfg.color + '20' }}
                              >
                                <Icon size={12} style={{ color: cfg.color }} />
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => handleToggleEnabled(rule.id)}
                          className={`w-10 h-5 rounded-full relative transition-colors ${
                            rule.enabled ? 'bg-[#3FB950]' : 'bg-[var(--bg-tertiary)]'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              rule.enabled ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {rule.last_triggered_at ? getRelativeTime(rule.last_triggered_at) : 'Never'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(rule)}
                            className="p-1.5 rounded hover:bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          {deleteConfirm === rule.id ? (
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => handleDelete(rule.id)}
                                className="p-1.5 rounded hover:bg-[var(--status-critical-bg)] text-[#F85149] transition-colors"
                                title="Confirm delete"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="p-1.5 rounded hover:bg-[var(--bg-overlay)] text-[var(--text-muted)] transition-colors"
                                title="Cancel"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(rule.id)}
                              className="p-1.5 rounded hover:bg-[var(--status-critical-bg)] text-[var(--text-muted)] hover:text-[#F85149] transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
                      No alert rules configured
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-2.5 font-medium">Rule</th>
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium">Message</th>
                  <th className="text-left px-4 py-2.5 font-medium">Severity</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channels</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {alertHistory.map(alert => {
                  const severityColor = alert.severity === 'critical' ? '#F85149' : '#D29922';
                  return (
                    <tr
                      key={alert.alert_id}
                      className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                        {new Date(alert.triggered_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{alert.rule_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono text-[var(--accent-primary)]">{alert.job_name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-[var(--text-secondary)] max-w-[300px] truncate block" title={alert.message}>
                          {alert.message}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ backgroundColor: severityColor + '18', color: severityColor }}
                        >
                          <AlertTriangle size={10} className="mr-1" />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          {alert.channels_notified.map(ch => {
                            const cfg = CHANNEL_ICONS[ch];
                            if (!cfg) return <span key={ch} className="text-[11px] text-[var(--text-muted)]">{ch}</span>;
                            const Icon = cfg.icon;
                            return (
                              <span
                                key={ch}
                                title={cfg.label}
                                className="w-5 h-5 rounded flex items-center justify-center"
                                style={{ backgroundColor: cfg.color + '20' }}
                              >
                                <Icon size={11} style={{ color: cfg.color }} />
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {alert.resolved_at ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(63,185,80,0.12)] text-[#3FB950]">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(248,81,73,0.12)] text-[#F85149]">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
        size="lg"
      >
        <div className="space-y-4">
          {/* Rule Name */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Rule Name</label>
            <Input
              value={form.name}
              onChange={e => updateForm('name', e.target.value)}
              placeholder="e.g., Order Settlement SLA"
            />
          </div>

          {/* Target Job */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Target Job</label>
            <Select
              options={jobOptions}
              value={form.target_job}
              onChange={e => updateForm('target_job', e.target.value)}
              aria-label="Target job"
              className="w-full"
            />
          </div>

          {/* Conditions */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Conditions</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Duration Threshold (min)</label>
                <Input
                  type="number"
                  value={form.duration_threshold_min}
                  onChange={e => updateForm('duration_threshold_min', e.target.value)}
                  placeholder="e.g., 60"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Failure Threshold (count)</label>
                <Input
                  type="number"
                  value={form.failure_threshold}
                  onChange={e => updateForm('failure_threshold', e.target.value)}
                  placeholder="e.g., 1"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 block">SLA Deadline (HH:MM)</label>
                <Input
                  value={form.sla_deadline}
                  onChange={e => updateForm('sla_deadline', e.target.value)}
                  placeholder="e.g., 03:00"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 block">CPU Threshold (%)</label>
                <Input
                  type="number"
                  value={form.cpu_threshold}
                  onChange={e => updateForm('cpu_threshold', e.target.value)}
                  placeholder="e.g., 90"
                />
              </div>
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Notification Channels</label>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                  <MessageSquare size={10} style={{ color: '#E01E5A' }} /> Slack Webhook URL
                </label>
                <Input
                  value={form.slack_webhook}
                  onChange={e => updateForm('slack_webhook', e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                  <Mail size={10} style={{ color: '#58A6FF' }} /> Email (comma separated)
                </label>
                <Input
                  value={form.email}
                  onChange={e => updateForm('email', e.target.value)}
                  placeholder="ops@company.com, admin@company.com"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                  <Phone size={10} style={{ color: '#06AC38' }} /> PagerDuty Integration Key
                </label>
                <Input
                  value={form.pagerduty_key}
                  onChange={e => updateForm('pagerduty_key', e.target.value)}
                  placeholder="PagerDuty key..."
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
                  <Webhook size={10} style={{ color: '#D29922' }} /> Webhook URL
                </label>
                <Input
                  value={form.webhook_url}
                  onChange={e => updateForm('webhook_url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Cooldown */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Cooldown Period (min)</label>
            <Input
              type="number"
              value={form.cooldown_min}
              onChange={e => updateForm('cooldown_min', e.target.value)}
              placeholder="30"
              className="w-32"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-default)]">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!form.name}>
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
