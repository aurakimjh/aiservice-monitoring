'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardTitle, Button, Input, Select } from '@/components/ui';
import { Tooltip } from '@/components/ui/tooltip';
import { ReflectionBadge } from './reflection-badge';
import type { AgentConfig, ConfigSection, ConfigField } from '@/types/monitoring';

interface ConfigEditorProps {
  config: AgentConfig;
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

export function ConfigEditor({ config }: ConfigEditorProps) {
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

  const handleChange = useCallback((key: string, val: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleSave = useCallback(() => {
    alert(`Configuration saved (v${config.version + 1}).\n\nChanges:\n${JSON.stringify(values, null, 2)}`);
  }, [config.version, values]);

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

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Configuration</Button>
      </div>
    </div>
  );
}
