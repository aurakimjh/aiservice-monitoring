'use client';

import { useState, useMemo } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, SearchInput } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { SystemFlamegraph } from '@/components/charts/system-flamegraph';
import { FlameGraphDiff } from '@/components/charts/flame-graph-diff';
import {
  getSystemProfilingProfiles,
  getSystemFlamegraphData,
  getSystemFlamegraphDiffData,
} from '@/lib/demo-data';
import { getRelativeTime, formatBytes } from '@/lib/utils';
import type { SystemProfile } from '@/types/monitoring';
import {
  Flame,
  Cpu,
  Moon,
  MemoryStick,
  GitCompareArrows,
  Download,
  Play,
  Monitor,
  Filter,
} from 'lucide-react';

const TYPE_TABS = [
  { key: 'cpu', label: 'CPU (on-CPU)', icon: Cpu, color: '#e87722' },
  { key: 'offcpu', label: 'Off-CPU', icon: Moon, color: '#3b82f6' },
  { key: 'memory', label: 'Memory', icon: MemoryStick, color: '#22c55e' },
  { key: 'diff', label: 'Diff', icon: GitCompareArrows, color: '#a855f7' },
] as const;

type TabKey = (typeof TYPE_TABS)[number]['key'];

export default function SystemProfilingPage() {
  const profiles = useMemo(() => getSystemProfilingProfiles(), []);
  const [activeTab, setActiveTab] = useState<TabKey>('cpu');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<SystemProfile | null>(null);

  // Unique agents for dropdown
  const agents = useMemo(() => {
    const set = new Map<string, string>();
    profiles.forEach(p => set.set(p.agent_id, p.hostname));
    return Array.from(set.entries()).map(([id, host]) => ({ id, hostname: host }));
  }, [profiles]);

  // Filtered profiles
  const filtered = useMemo(() => {
    return profiles.filter(p => {
      if (agentFilter && p.agent_id !== agentFilter) return false;
      if (activeTab !== 'diff' && p.profile_type !== activeTab) return false;
      if (search) {
        const term = search.toLowerCase();
        if (!p.hostname.toLowerCase().includes(term) && !p.agent_id.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [profiles, agentFilter, activeTab, search]);

  // KPI metrics
  const totalProfiles = profiles.length;
  const activeAgents = agents.length;
  const avgDuration = useMemo(() => {
    const durations = profiles.filter(p => p.duration_sec > 0);
    return durations.length > 0 ? Math.round(durations.reduce((s, p) => s + p.duration_sec, 0) / durations.length) : 0;
  }, [profiles]);
  const totalStorage = useMemo(() => profiles.reduce((s, p) => s + p.size_bytes, 0), [profiles]);

  // Flamegraph data
  const flamegraphData = useMemo(() => {
    if (selectedProfile) {
      return getSystemFlamegraphData(selectedProfile.profile_id, selectedProfile.profile_type);
    }
    // Default: first matching profile
    const first = filtered[0];
    if (first) {
      return getSystemFlamegraphData(first.profile_id, first.profile_type);
    }
    return getSystemFlamegraphData('sys-prof-001', activeTab === 'diff' ? 'cpu' : activeTab);
  }, [selectedProfile, filtered, activeTab]);

  const diffData = useMemo(() => {
    if (activeTab === 'diff') {
      return getSystemFlamegraphDiffData();
    }
    return null;
  }, [activeTab]);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Profiling', href: '/profiling' },
          { label: 'System Profiling', icon: <Flame size={14} /> },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">System Profiling</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            perf/eBPF system-level flamegraphs with on-CPU, off-CPU, and memory profiling
          </p>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--accent-primary)] text-white rounded hover:opacity-90 transition-opacity">
          <Play size={12} />
          Trigger New Profile
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Profiles" value={totalProfiles} subtitle="perf/eBPF captures" status="healthy" />
        <KPICard title="Active Agents" value={activeAgents} subtitle="agents reporting" status="healthy" />
        <KPICard title="Avg Duration" value={avgDuration} unit="s" subtitle="profile duration" status="healthy" />
        <KPICard title="Storage Used" value={formatBytes(totalStorage)} subtitle="folded stack data" status="healthy" />
      </div>

      {/* Agent selector + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Monitor size={12} className="text-[var(--text-muted)]" />
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1 text-[var(--text-primary)]"
          >
            <option value="">All Agents</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.hostname} ({a.id})</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-[var(--text-muted)]" />
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search host..." className="w-40" />
        </div>
        <span className="text-xs text-[var(--text-muted)] ml-auto">{filtered.length} profiles</span>
      </div>

      {/* Profile type tabs */}
      <div className="flex gap-1 border-b border-[var(--border-default)]">
        {TYPE_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedProfile(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={12} style={activeTab === tab.key ? { color: tab.color } : undefined} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main flamegraph area */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {activeTab === 'diff' ? 'Differential Flamegraph' : `${TYPE_TABS.find(t => t.key === activeTab)?.label || 'CPU'} Flamegraph`}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 text-xs px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Download size={11} />
                SVG
              </button>
              <button className="flex items-center gap-1 text-xs px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Download size={11} />
                JSON
              </button>
              <button className="flex items-center gap-1 text-xs px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Download size={11} />
                Folded
              </button>
            </div>
          </div>
          {selectedProfile && (
            <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-muted)]">
              <span>{selectedProfile.hostname}</span>
              <span>|</span>
              <span>Target: {selectedProfile.target}</span>
              <span>|</span>
              <span>{selectedProfile.total_samples.toLocaleString()} samples</span>
              <span>|</span>
              <span>{selectedProfile.duration_sec}s @ {selectedProfile.sampling_frequency}Hz</span>
              <span>|</span>
              <span>Resolved: {selectedProfile.symbol_stats.resolved} / Unknown: {selectedProfile.symbol_stats.unknown} / JIT: {selectedProfile.symbol_stats.jit}</span>
            </div>
          )}
        </CardHeader>
        <div className="p-3">
          {activeTab === 'diff' && diffData ? (
            <FlameGraphDiff root={diffData.root} height={550} />
          ) : flamegraphData ? (
            <SystemFlamegraph
              root={flamegraphData.root}
              height={550}
              profileType={flamegraphData.profileType as 'cpu' | 'offcpu' | 'memory' | 'mixed'}
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-[var(--text-muted)] text-sm">
              No profile data available. Trigger a new profile capture.
            </div>
          )}
        </div>
      </Card>

      {/* Profile list table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile List</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-left text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Profile ID</th>
                <th className="px-3 py-2 font-medium">Agent / Host</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Samples</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Symbols</th>
                <th className="px-3 py-2 font-medium">Captured</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isSelected = selectedProfile?.profile_id === p.profile_id;
                const typeBadge: Record<string, { bg: string; label: string }> = {
                  cpu: { bg: 'bg-orange-500/20 text-orange-400', label: 'CPU' },
                  offcpu: { bg: 'bg-blue-500/20 text-blue-400', label: 'Off-CPU' },
                  memory: { bg: 'bg-green-500/20 text-green-400', label: 'Memory' },
                };
                const tb = typeBadge[p.profile_type] || typeBadge.cpu;
                const symbolPct = p.symbol_stats.resolved + p.symbol_stats.unknown > 0
                  ? Math.round((p.symbol_stats.resolved / (p.symbol_stats.resolved + p.symbol_stats.unknown)) * 100)
                  : 100;

                return (
                  <tr
                    key={p.profile_id}
                    className={`border-b border-[var(--border-default)] cursor-pointer transition-colors ${
                      isSelected ? 'bg-[var(--accent-primary)]/10' : 'hover:bg-[var(--bg-secondary)]'
                    }`}
                    onClick={() => setSelectedProfile(isSelected ? null : p)}
                  >
                    <td className="px-3 py-2 font-mono text-[var(--text-primary)]">{p.profile_id}</td>
                    <td className="px-3 py-2">
                      <div className="text-[var(--text-primary)]">{p.hostname}</div>
                      <div className="text-[var(--text-muted)]">{p.agent_id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tb.bg}`}>{tb.label}</span>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.target}</td>
                    <td className="px-3 py-2 text-[var(--text-primary)] font-mono">{p.total_samples.toLocaleString()}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {p.duration_sec}s {p.sampling_frequency > 0 ? `@ ${p.sampling_frequency}Hz` : ''}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{formatBytes(p.size_bytes)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${symbolPct}%`,
                              background: symbolPct > 90 ? '#22c55e' : symbolPct > 70 ? '#eab308' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="text-[var(--text-muted)]">{symbolPct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{getRelativeTime(p.captured_at)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    No profiles found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
