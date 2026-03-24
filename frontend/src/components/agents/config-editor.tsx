'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { ReflectionBadge } from './reflection-badge';
import type { AgentConfig, ConfigSection, ConfigField } from '@/types/monitoring';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ConfigEditorProps {
  config: AgentConfig;
  agentId?: string;
  onSave?: (config: Record<string, string | number | boolean>, version: number) => Promise<void>;
}

// ── App Restart Guidance Modal (25-4-3) ───────────────────────────────────────

function AppRestartModal({
  open,
  onClose,
  onConfirm,
  changedFields,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changedFields: string[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="App Restart Required" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-[var(--radius)] bg-[var(--status-critical)]/10 border border-[var(--status-critical)]/30">
          <AlertTriangle size={16} className="text-[var(--status-critical)] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--text-primary)]">
              The following changes require a full application restart:
            </p>
            <ul className="space-y-0.5">
              {changedFields.map((f) => (
                <li key={f} className="text-[11px] font-mono text-[var(--status-critical)]">
                  • {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          These settings take effect only after a complete application restart.
          The agent process must be manually restarted on the host.
        </p>

        <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-tertiary)] border border-[var(--border-default)]">
          <RotateCcw size={12} className="text-[var(--text-muted)] shrink-0" />
          <code className="text-[11px] text-[var(--text-secondary)] font-mono">
            sudo systemctl restart aitop-agent
          </code>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { onConfirm(); onClose(); }}>
            Save &amp; I&apos;ll Restart Manually
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string | number | boolean;
  onChange: (key: string, val: string | number | boolean) => void;
}) {
  switch (field.type) {
    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(field.key, e.target.checked)}
            className={cn(
              'w-4 h-4 rounded-[var(--radius-sm)] border border-[var(--border-default)]',
              'bg-[var(--bg-tertiary)] accent-[var(--accent-primary)] cursor-pointer',
            )}
          />
          <span className="text-xs text-[var(--text-secondary)]">
            {value ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          className="max-w-[200px]"
        />
      );

    case 'select':
      return (
        <Select
          value={value as string}
          onChange={(e) => onChange(field.key, e.target.value)}
          options={(field.options ?? []).map((o) => ({ label: o, value: o }))}
          aria-label={field.label}
          className="max-w-[200px]"
        />
      );

    case 'string':
    default:
      return (
        <Input
          type="text"
          value={value as string}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="max-w-[320px]"
        />
      );
  }
}

function SectionCard({
  section,
  values,
  onChange,
}: {
  section: ConfigSection;
  values: Record<string, string | number | boolean>;
  onChange: (key: string, val: string | number | boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.label}</CardTitle>
      </CardHeader>

      <div className="space-y-4">
        {section.fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            {/* Label row */}
            <div className="flex items-center gap-2">
              <Tooltip content={field.description} side="right">
                <span className="text-[13px] font-medium text-[var(--text-primary)] cursor-help underline decoration-dotted underline-offset-4 decoration-[var(--text-muted)]">
                  {field.label}
                </span>
              </Tooltip>
              <ReflectionBadge level={field.reflectionLevel} />
            </div>

            {/* Description subtitle */}
            <p className="text-[11px] text-[var(--text-muted)] leading-tight">
              {field.description}
            </p>

            {/* Field control */}
            <FieldRenderer
              field={field}
              value={values[field.key] ?? field.value}
              onChange={onChange}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ConfigEditor({ config, agentId, onSave }: ConfigEditorProps) {
  // Initialize local state from config
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    for (const section of config.sections) {
      for (const field of section.fields) {
        initial[field.key] = field.value;
      }
    }
    return initial;
  });

  const [appRestartOpen, setAppRestartOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<Record<string, string | number | boolean> | null>(null);

  const handleChange = useCallback((key: string, val: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Collect all fields that require app restart (reflectionLevel === 'app')
  const getAppRestartFields = useCallback((changedValues: Record<string, string | number | boolean>) => {
    const appFields: string[] = [];
    for (const section of config.sections) {
      for (const field of section.fields) {
        if (field.reflectionLevel === 'app' && changedValues[field.key] !== field.value) {
          appFields.push(field.key);
        }
      }
    }
    return appFields;
  }, [config.sections]);

  const doSave = useCallback(async (saveValues: Record<string, string | number | boolean>) => {
    if (onSave) {
      await onSave(saveValues, config.version + 1);
    } else {
      // fallback demo
      alert(`Configuration saved (v${config.version + 1}).`);
    }
  }, [onSave, config.version]);

  const handleSave = useCallback(async () => {
    const appRestartFields = getAppRestartFields(values);
    if (appRestartFields.length > 0) {
      // 25-4-3: Show App Restart modal before saving
      setPendingSave(values);
      setAppRestartOpen(true);
    } else {
      await doSave(values);
    }
  }, [values, getAppRestartFields, doSave]);

  const handleConfirmSave = useCallback(async () => {
    if (pendingSave) {
      await doSave(pendingSave);
      setPendingSave(null);
    }
  }, [pendingSave, doSave]);

  const appRestartFields = getAppRestartFields(values);

  return (
    <div className="space-y-4">
      {config.sections.map((section) => (
        <SectionCard
          key={section.name}
          section={section}
          values={values}
          onChange={handleChange}
        />
      ))}

      {appRestartFields.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-[var(--radius-sm)] bg-[var(--status-critical)]/8 border border-[var(--status-critical)]/25">
          <AlertTriangle size={13} className="text-[var(--status-critical)] shrink-0" />
          <p className="text-[11px] text-[var(--status-critical)]">
            {appRestartFields.length} field{appRestartFields.length > 1 ? 's' : ''} require an app restart to take effect.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()}>Save Configuration</Button>
      </div>

      {/* 25-4-3: App Restart guidance modal */}
      <AppRestartModal
        open={appRestartOpen}
        onClose={() => { setAppRestartOpen(false); setPendingSave(null); }}
        onConfirm={() => void handleConfirmSave()}
        changedFields={appRestartFields}
      />
    </div>
  );
}
