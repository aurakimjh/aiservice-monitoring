'use client';

import { use, useMemo, useCallback } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, DataSourceBadge } from '@/components/ui';
import { useDataSource } from '@/hooks/use-data-source';
import { FlameGraph } from '@/components/charts/flame-graph';
import { getFlameGraphData, getProfilingProfiles } from '@/lib/demo-data';
import Link from 'next/link';
import {
  Flame,
  ArrowLeft,
  ExternalLink,
  Download,
  GitCompareArrows,
} from 'lucide-react';

const LANG_BADGE: Record<string, { color: string; label: string }> = {
  go: { color: '#00ADD8', label: 'Go' },
  python: { color: '#3776AB', label: 'Python' },
  java: { color: '#ED8B00', label: 'Java' },
  dotnet: { color: '#512BD4', label: '.NET' },
  nodejs: { color: '#339933', label: 'Node.js' },
};

export default function ProfileDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const demoProfiles = useCallback(() => getProfilingProfiles(), []);
  const { data: profilesResult, source } = useDataSource(`/profiling/${profileId}`, demoProfiles, { refreshInterval: 30_000 });
  const profiles = Array.isArray(profilesResult) ? profilesResult : (profilesResult as any)?.items ?? getProfilingProfiles();
  const profile = useMemo(() => profiles.find((p: any) => p.profile_id === profileId), [profiles, profileId]);
  const flameData = useMemo(() => getFlameGraphData(profileId), [profileId]);

  if (!profile) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Profiling', href: '/profiling' }, { label: 'Not Found' }]} />
        <div className="text-center py-12 text-xs text-[var(--text-muted)]">Profile not found</div>
      </div>
    );
  }

  const lang = LANG_BADGE[profile.language] || { color: '#888', label: profile.language };

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Profiling', href: '/profiling', icon: <Flame size={14} /> },
          { label: `${profile.service_name} — ${profile.profile_type.toUpperCase()}` },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/profiling" className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
            <ArrowLeft size={16} className="text-[var(--text-muted)]" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">{profile.service_name}</h1>
              <DataSourceBadge source={source} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium" style={{ background: lang.color }}>
                {lang.label}
              </span>
              <Badge status="healthy">{profile.profile_type.toUpperCase()}</Badge>
              <span className="text-xs text-[var(--text-muted)]">
                {profile.sample_count.toLocaleString()} samples / {(profile.size_bytes / 1024).toFixed(0)} KB
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {profile.trace_id && (
            <Link
              href={`/traces/${profile.trace_id}`}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <ExternalLink size={12} /> View Linked Trace
            </Link>
          )}
          <button className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">
            <Download size={12} /> Download Raw
          </button>
          <Link
            href={`/profiling?compare=${profileId}`}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <GitCompareArrows size={12} /> Compare
          </Link>
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-4 text-xs">
          <div>
            <span className="text-[var(--text-muted)]">Profile ID</span>
            <div className="font-mono mt-0.5 text-[var(--text-primary)]">{profile.profile_id}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Agent</span>
            <div className="mt-0.5 text-[var(--text-primary)]">{profile.agent_id}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Format</span>
            <div className="mt-0.5 text-[var(--text-primary)] uppercase">{profile.format}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Duration</span>
            <div className="mt-0.5 text-[var(--text-primary)]">{profile.duration_sec > 0 ? `${profile.duration_sec}s` : 'Snapshot'}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Started</span>
            <div className="mt-0.5 text-[var(--text-primary)]">{new Date(profile.started_at).toLocaleString()}</div>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Trace</span>
            <div className="mt-0.5">
              {profile.trace_id ? (
                <Link href={`/traces/${profile.trace_id}`} className="text-[var(--accent-primary)] hover:underline font-mono">
                  {profile.trace_id.slice(0, 12)}...
                </Link>
              ) : (
                <span className="text-[var(--text-muted)]">-</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Flame Graph */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame size={14} />
            Flame Graph
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <FlameGraph
            root={flameData.root}
            height={500}
            profileType={profile.profile_type}
          />
        </div>
      </Card>
    </div>
  );
}
