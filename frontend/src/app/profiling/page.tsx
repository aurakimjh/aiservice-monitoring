'use client';

import { useState, useMemo, useCallback } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, SearchInput, DataSourceBadge } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { FlameGraph } from '@/components/charts/flame-graph';
import { FlameGraphDiff } from '@/components/charts/flame-graph-diff';
import { getProfilingProfiles, getFlameGraphData, getFlameGraphDiffData } from '@/lib/demo-data';
import { useDataSource } from '@/hooks/use-data-source';
import { getRelativeTime } from '@/lib/utils';
import type { ProfileMetadata } from '@/types/monitoring';
import {
  Flame,
  Cpu,
  MemoryStick,
  Filter,
  GitCompareArrows,
} from 'lucide-react';

const LANG_BADGE: Record<string, { color: string; label: string }> = {
  go: { color: '#00ADD8', label: 'Go' },
  python: { color: '#3776AB', label: 'Python' },
  java: { color: '#ED8B00', label: 'Java' },
  dotnet: { color: '#512BD4', label: '.NET' },
  nodejs: { color: '#339933', label: 'Node.js' },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  cpu: Cpu,
  memory: MemoryStick,
  goroutine: Cpu,
  thread: Cpu,
  lock: Cpu,
  alloc: MemoryStick,
};

export default function ProfilingPage() {
  const demoProfiles = useCallback(() => getProfilingProfiles(), []);
  const { data: profilesData, source } = useDataSource('/profiling/profiles', demoProfiles, { refreshInterval: 30_000 });
  const profiles = profilesData ?? [];
  const [activeTab, setActiveTab] = useState<'profiles' | 'compare'>('profiles');
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<ProfileMetadata | null>(null);
  const [compareBase, setCompareBase] = useState('');
  const [compareTarget, setCompareTarget] = useState('');

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search && !p.service_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (langFilter && p.language !== langFilter) return false;
      if (typeFilter && p.profile_type !== typeFilter) return false;
      return true;
    });
  }, [profiles, search, langFilter, typeFilter]);

  const uniqueServices = useMemo(() => [...new Set(profiles.map((p) => p.service_name))], [profiles]);
  const totalStorage = useMemo(() => profiles.reduce((sum, p) => sum + p.size_bytes, 0), [profiles]);
  const avgDuration = useMemo(() => {
    const durations = profiles.filter((p) => p.duration_sec > 0);
    return durations.length > 0 ? Math.round(durations.reduce((s, p) => s + p.duration_sec, 0) / durations.length) : 0;
  }, [profiles]);

  const flameGraphData = useMemo(() => selectedProfile ? getFlameGraphData(selectedProfile.profile_id) : null, [selectedProfile]);
  const diffData = useMemo(() => (compareBase && compareTarget) ? getFlameGraphDiffData() : null, [compareBase, compareTarget]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Profiling', icon: <Flame size={14} /> },
        ]}
      />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Continuous Profiling</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          CPU/Memory flame graphs with trace correlation
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Profiles" value={profiles.length} subtitle="captured profiles" status="healthy" />
        <KPICard title="Active Services" value={uniqueServices.length} subtitle="services profiled" status="healthy" />
        <KPICard title="Avg Duration" value={avgDuration} unit="s" subtitle="profile duration" status="healthy" />
        <KPICard title="Storage Used" value={`${(totalStorage / 1024 / 1024).toFixed(1)}`} unit="MB" subtitle="profile data" status="healthy" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)]">
        {(['profiles', 'compare'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab === 'profiles' ? 'Profiles' : 'Compare'}
          </button>
        ))}
      </div>

      {activeTab === 'profiles' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search service..." className="w-48" />
            <div className="flex items-center gap-1">
              <Filter size={12} className="text-[var(--text-muted)]" />
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1 text-[var(--text-primary)]"
              >
                <option value="">All Languages</option>
                <option value="go">Go</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1 text-[var(--text-primary)]"
              >
                <option value="">All Types</option>
                <option value="cpu">CPU</option>
                <option value="memory">Memory</option>
                <option value="goroutine">Goroutine</option>
                <option value="thread">Thread</option>
              </select>
            </div>
            <span className="text-xs text-[var(--text-muted)] ml-auto">{filtered.length} profiles</span>
          </div>

          {/* Profile table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                    <th className="text-left px-3 py-2 font-medium">Service</th>
                    <th className="text-left px-3 py-2 font-medium">Language</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Duration</th>
                    <th className="text-right px-3 py-2 font-medium">Samples</th>
                    <th className="text-right px-3 py-2 font-medium">Size</th>
                    <th className="text-left px-3 py-2 font-medium">Trace</th>
                    <th className="text-left px-3 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const lang = LANG_BADGE[p.language] || { color: '#888', label: p.language };
                    const isSelected = selectedProfile?.profile_id === p.profile_id;

                    return (
                      <tr
                        key={p.profile_id}
                        onClick={() => setSelectedProfile(isSelected ? null : p)}
                        className={`border-b border-[var(--border-muted)] cursor-pointer transition-colors ${
                          isSelected ? 'bg-[var(--accent-primary)]/10' : 'hover:bg-[var(--bg-secondary)]'
                        }`}
                      >
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{p.service_name}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium" style={{ background: lang.color }}>
                            {lang.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 capitalize">{p.profile_type}</td>
                        <td className="px-3 py-2 text-right font-mono">{p.duration_sec > 0 ? `${p.duration_sec}s` : '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{p.sample_count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{(p.size_bytes / 1024).toFixed(0)} KB</td>
                        <td className="px-3 py-2">
                          {p.trace_id ? (
                            <a href={`/traces/${p.trace_id}`} className="text-[var(--accent-primary)] hover:underline" onClick={(e) => e.stopPropagation()}>
                              {p.trace_id.slice(0, 8)}...
                            </a>
                          ) : (
                            <span className="text-[var(--text-muted)]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{getRelativeTime(p.started_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* FlameGraph panel */}
          {selectedProfile && flameGraphData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame size={14} />
                  Flame Graph — {selectedProfile.service_name} ({selectedProfile.profile_type.toUpperCase()})
                </CardTitle>
              </CardHeader>
              <div className="px-4 pb-4">
                <FlameGraph
                  root={flameGraphData.root}
                  height={400}
                  profileType={selectedProfile.profile_type}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {activeTab === 'compare' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows size={14} />
              Compare Profiles
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Base Profile</label>
                <select
                  value={compareBase}
                  onChange={(e) => setCompareBase(e.target.value)}
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                >
                  <option value="">Select base...</option>
                  {profiles.map((p) => (
                    <option key={p.profile_id} value={p.profile_id}>
                      {p.service_name} — {p.profile_type} ({p.language}) — {getRelativeTime(p.started_at)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Target Profile</label>
                <select
                  value={compareTarget}
                  onChange={(e) => setCompareTarget(e.target.value)}
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                >
                  <option value="">Select target...</option>
                  {profiles.map((p) => (
                    <option key={p.profile_id} value={p.profile_id}>
                      {p.service_name} — {p.profile_type} ({p.language}) — {getRelativeTime(p.started_at)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {diffData && (
              <FlameGraphDiff root={diffData.root} height={400} />
            )}

            {!diffData && (
              <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                Select two profiles to compare
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
