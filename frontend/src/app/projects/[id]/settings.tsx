'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, Button, Input, Select } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { RequirePermission } from '@/components/auth';
import { useProjectStore } from '@/stores/project-store';
import { AlertTriangle, Trash2, Save } from 'lucide-react';
import type { Project, Environment } from '@/types/monitoring';

const ENV_OPTIONS = [
  { label: 'Production', value: 'production' },
  { label: 'Staging', value: 'staging' },
  { label: 'Development', value: 'development' },
];

interface ProjectSettingsProps {
  project: Project;
}

export function ProjectSettings({ project }: ProjectSettingsProps) {
  const router = useRouter();
  const removeProject = useProjectStore((s) => s.removeProject);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [name] = useState(project.name);
  const [description] = useState(project.description);
  const [environment] = useState<Environment>(project.environment);

  const handleDelete = () => {
    if (deleteConfirm !== project.name) return;
    removeProject(project.id);
    router.push('/projects');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* General Settings */}
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Project Name</label>
            <Input defaultValue={name} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Description</label>
            <Input defaultValue={description} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Environment</label>
            <Select options={ENV_OPTIONS} defaultValue={environment} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(project.tags).map(([k, v]) => (
                <Badge key={k}>{k}: {v}</Badge>
              ))}
              <Button variant="ghost" size="sm">+ Add Tag</Button>
            </div>
          </div>
          <div className="pt-2">
            <Button variant="primary" size="md">
              <Save size={14} />
              Save Changes
            </Button>
          </div>
        </div>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader><CardTitle>Members</CardTitle></CardHeader>
        <div className="space-y-2">
          {[
            { name: 'Aura Kim', email: 'admin@aitop.io', role: 'Owner' },
            { name: 'SRE Kim', email: 'sre@aitop.io', role: 'Editor' },
            { name: 'AI Engineer Park', email: 'ai@aitop.io', role: 'Editor' },
            { name: 'Viewer Lee', email: 'viewer@aitop.io', role: 'Viewer' },
          ].map((m) => (
            <div key={m.email} className="flex items-center justify-between py-1.5 text-sm">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{m.name}</span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">{m.email}</span>
              </div>
              <Badge>{m.role}</Badge>
            </div>
          ))}
          <Button variant="ghost" size="sm">+ Invite Member</Button>
        </div>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader><CardTitle>Data Retention</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">Metrics</div>
            <Select options={[{ label: '15 days', value: '15' }, { label: '30 days', value: '30' }, { label: '90 days', value: '90' }]} defaultValue="30" />
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">Traces</div>
            <Select options={[{ label: '7 days', value: '7' }, { label: '14 days', value: '14' }, { label: '30 days', value: '30' }]} defaultValue="7" />
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">Logs</div>
            <Select options={[{ label: '7 days', value: '7' }, { label: '14 days', value: '14' }, { label: '30 days', value: '30' }]} defaultValue="7" />
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <RequirePermission resource="projects" action="delete" fallback={null}>
        <Card className="border-[var(--status-critical)]/30">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-1.5 text-[var(--status-critical)]">
                <AlertTriangle size={14} />
                Danger Zone
              </span>
            </CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-secondary)]">
              Deleting a project will permanently remove all associated data including hosts, services, metrics, traces, and diagnostic reports. This action cannot be undone.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-muted)]">
                Type <strong className="text-[var(--text-primary)]">{project.name}</strong> to confirm
              </label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={project.name}
              />
            </div>
            <Button
              variant="danger"
              size="md"
              disabled={deleteConfirm !== project.name}
              onClick={handleDelete}
            >
              <Trash2 size={14} />
              Delete Project
            </Button>
          </div>
        </Card>
      </RequirePermission>
    </div>
  );
}
