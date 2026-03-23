'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';

interface PromptEditorProps {
  systemPrompt: string;
  userTemplate: string;
  variables: string[];
  readOnly?: boolean;
}

export function PromptEditor({ systemPrompt, userTemplate, variables, readOnly = false }: PromptEditorProps) {
  return (
    <div className="space-y-4">
      {/* System Prompt */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          readOnly={readOnly}
          rows={6}
          className={cn(
            'w-full rounded-[var(--radius-md)] font-mono text-xs leading-relaxed',
            'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
            'text-[var(--text-primary)] p-3',
            'focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
            'resize-y',
            readOnly && 'cursor-default opacity-90',
          )}
        />
      </div>

      {/* User Template */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
          User Template
        </label>
        <textarea
          value={userTemplate}
          readOnly={readOnly}
          rows={5}
          className={cn(
            'w-full rounded-[var(--radius-md)] font-mono text-xs leading-relaxed',
            'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
            'text-[var(--text-primary)] p-3',
            'focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
            'resize-y',
            readOnly && 'cursor-default opacity-90',
          )}
        />
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          Variables use {'{{variable}}'} syntax and are highlighted at runtime.
        </p>
      </div>

      {/* Variables */}
      {variables.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            Variables
          </label>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <Badge key={v} className="font-mono text-[11px] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/30">
                {`{{${v}}}`}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
