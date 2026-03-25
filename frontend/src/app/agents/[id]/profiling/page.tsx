'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/monitoring';
import {
  Zap,
  ZapOff,
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Cpu,
  MemoryStick,
  Terminal,
  Server,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Runtime = 'java' | 'python' | 'dotnet' | 'nodejs' | 'go';
type ProfileType = 'cpu' | 'memory' | 'thread' | 'lock';
type SessionStatus = 'pending' | 'active' | 'failed' | 'detached';

interface DetectedProcess {
  pid: number;
  runtime: Runtime;
  name: string;
  version: string;
  reported_at: string;
}

interface AttachSession {
  session_id: string;
  agent_id: string;
  pid: number;
  runtime: Runtime;
  service_name: string;
  status: SessionStatus;
  error_code?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  latest_profile?: {
    profile_id: string;
    profile_type: string;
    format: string;
    duration_sec: number;
    size_bytes: number;
    captured_at: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_META: Record<Runtime, { label: string; color: string; icon: string }> = {
  java:   { label: 'Java',    color: '#ED8B00', icon: '☕' },
  python: { label: 'Python',  color: '#3776AB', icon: '🐍' },
  dotnet: { label: '.NET',    color: '#512BD4', icon: '⚙️' },
  nodejs: { label: 'Node.js', color: '#339933', icon: '🟢' },
  go:     { label: 'Go',      color: '#00ADD8', icon: '🔵' },
};

const ATTACH_MECHANISM: Record<Runtime, string> = {
  java:   'JVM Attach API (VirtualMachine.attach + loadAgent)',
  python: 'py-spy PID-based external stack sampling',
  dotnet: 'EventPipe DiagnosticsClient IPC',
  nodejs: 'Chrome DevTools Protocol (SIGUSR1 → V8 Inspector)',
  go:     'net/http/pprof HTTP polling',
};

const PROFILE_TYPES: { id: ProfileType; label: string; icon: React.ElementType }[] = [
  { id: 'cpu',    label: 'CPU',    icon: Cpu },
  { id: 'memory', label: 'Memory', icon: MemoryStick },
  { id: 'thread', label: 'Thread', icon: Terminal },
  { id: 'lock',   label: 'Lock',   icon: Server },
];

// ── Demo data ────────────────────────────────────────────────────────────────

function getDemoProcesses(agentId: string): DetectedProcess[] {
  return [
    { pid: 12345, runtime: 'java',   name: 'OrderService',     version: '17.0.9',  reported_at: new Date().toISOString() },
    { pid: 23456, runtime: 'python', name: 'ml-inference',     version: '3.11.5',  reported_at: new Date().toISOString() },
    { pid: 34567, runtime: 'dotnet', name: 'PaymentAPI',       version: '8.0.1',   reported_at: new Date().toISOString() },
    { pid: 45678, runtime: 'nodejs', name: 'api-gateway',      version: '20.11.0', reported_at: new Date().toISOString() },
    { pid: 56789, runtime: 'go',     name: 'metrics-exporter', version: '1.22.0',  reported_at: new Date().toISOString() },
  ];
}

// ── Status badge ─────────────────────────────────────────────────────────────

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const configs: Record<SessionStatus, { label: string; className: string; icon: React.ElementType }> = {
    pending:  { label: 'Pending',  className: 'bg-yellow-500/15 text-yellow-400',  icon: Loader2 },
    active:   { label: 'Active',   className: 'bg-green-500/15 text-green-400',    icon: CheckCircle2 },
    failed:   { label: 'Failed',   className: 'bg-red-500/15 text-red-400',        icon: AlertTriangle },
    detached: { label: 'Detached', className: 'bg-gray-500/15 text-gray-400',      icon: ZapOff },
  };
  const cfg = configs[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${cfg.className}`}>
      <Icon size={10} className={status === 'pending' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentProfilingPage() {
  const { id: agentId } = useParams<{ id: string }>();

  const [processes, setProcesses] = useState<DetectedProcess[]>([]);
  const [sessions, setSessions] = useState<AttachSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<DetectedProcess | null>(null);
  const [profileMode, setProfileMode] = useState<'attach' | 'full'>('attach');
  const [profileType, setProfileType] = useState<ProfileType>('cpu');
  const [durationSec, setDurationSec] = useState(30);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [profiling, setProfiling] = useState<Record<string, boolean>>({});

  // Load processes
  const loadProcesses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/attach/${agentId}/processes`);
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.items ?? []);
      } else {
        setProcesses(getDemoProcesses(agentId));
      }
    } catch {
      setProcesses(getDemoProcesses(agentId));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/attach/${agentId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.items ?? []);
      }
    } catch {
      // ignore
    }
  }, [agentId]);

  useEffect(() => {
    loadProcesses();
    loadSessions();
  }, [loadProcesses, loadSessions]);

  // Attach to a process
  const handleAttach = async () => {
    if (!selectedProcess) return;
    setAttachError(null);
    try {
      const res = await fetch(`/api/v1/attach/${agentId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pid: selectedProcess.pid,
          runtime: selectedProcess.runtime,
          service_name: selectedProcess.name,
        }),
      });
      if (res.status === 409) {
        const err = await res.json();
        setAttachError(err.message ?? 'Already attached');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAttachError(err.message ?? 'Attach failed');
        return;
      }
      await loadSessions();
    } catch (e) {
      setAttachError('Network error');
    }
  };

  // Detach session
  const handleDetach = async (sessionId: string) => {
    try {
      await fetch(`/api/v1/attach/${agentId}/sessions/${sessionId}`, { method: 'DELETE' });
      await loadSessions();
    } catch {
      // ignore
    }
  };

  // Trigger profile capture
  const handleProfile = async (sessionId: string) => {
    setProfiling((p) => ({ ...p, [sessionId]: true }));
    try {
      await fetch(`/api/v1/attach/${agentId}/sessions/${sessionId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_type: profileType, duration_sec: durationSec }),
      });
    } finally {
      setTimeout(() => {
        setProfiling((p) => ({ ...p, [sessionId]: false }));
        loadSessions();
      }, durationSec * 1000 + 2000);
    }
  };

  const activeCount = sessions.filter((s) => s.status === 'active').length;
  const failedCount = sessions.filter((s) => s.status === 'failed').length;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: agentId, href: `/agents` },
          { label: 'Runtime Attach', icon: <Zap size={14} /> },
        ]}
      />

      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Runtime Attach Profiling</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Attach to running processes without restart — Java, Python, .NET, Node.js, Go
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Detected Processes" value={processes.length} subtitle="attachable" status="healthy" />
        <KPICard title="Active Sessions" value={activeCount} subtitle="profiling" status={activeCount > 0 ? 'healthy' : undefined} />
        <KPICard title="Failed" value={failedCount} subtitle="attach errors" status={failedCount > 0 ? 'critical' : 'healthy'} />
        <KPICard title="Total Sessions" value={sessions.length} subtitle="all time" status="healthy" />
      </div>

      {/* Process list + attach panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Detected Processes ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={14} />
              Detected Processes
              <button
                onClick={loadProcesses}
                className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Refresh"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </CardTitle>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                  <th className="text-left px-3 py-2 font-medium">Process</th>
                  <th className="text-left px-3 py-2 font-medium">Runtime</th>
                  <th className="text-right px-3 py-2 font-medium">PID</th>
                  <th className="text-left px-3 py-2 font-medium">Version</th>
                  <th className="text-left px-3 py-2 font-medium">Attach Method</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((proc) => {
                  const meta = RUNTIME_META[proc.runtime] ?? { label: proc.runtime, color: '#888', icon: '?' };
                  const isSelected = selectedProcess?.pid === proc.pid;
                  return (
                    <tr
                      key={proc.pid}
                      onClick={() => setSelectedProcess(isSelected ? null : proc)}
                      className={`border-b border-[var(--border-muted)] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)]/10 ring-1 ring-inset ring-[var(--accent-primary)]/30'
                          : 'hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{proc.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                          style={{ background: meta.color }}
                        >
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">{proc.pid}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{proc.version || '-'}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)] truncate max-w-[160px]" title={ATTACH_MECHANISM[proc.runtime]}>
                        {ATTACH_MECHANISM[proc.runtime]}
                      </td>
                    </tr>
                  );
                })}
                {processes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-muted)]">
                      {loading ? 'Scanning processes…' : 'No attachable processes found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Attach Panel ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={14} />
              Profiling Configuration
            </CardTitle>
          </CardHeader>

          <div className="px-4 pb-4 space-y-4">
            {/* Selected process */}
            {selectedProcess ? (
              <div className="flex items-center gap-2 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-default)]">
                <span
                  className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                  style={{ background: RUNTIME_META[selectedProcess.runtime]?.color ?? '#888' }}
                >
                  {RUNTIME_META[selectedProcess.runtime]?.icon} {RUNTIME_META[selectedProcess.runtime]?.label}
                </span>
                <span className="text-xs font-medium text-[var(--text-primary)]">{selectedProcess.name}</span>
                <span className="text-xs font-mono text-[var(--text-muted)]">PID {selectedProcess.pid}</span>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Select a process from the list to configure profiling.</p>
            )}

            {/* Mode selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Profiling Mode</label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  profileMode === 'attach'
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-[var(--border-default)] hover:border-[var(--border-muted)]'
                }`}>
                  <input
                    type="radio"
                    name="mode"
                    value="attach"
                    checked={profileMode === 'attach'}
                    onChange={() => setProfileMode('attach')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                      <span className="text-green-400">🟢</span>
                      Attach Mode
                      <Badge className="ml-1 text-[9px] px-1 py-0 bg-green-500/15 text-green-400 border-0">Recommended</Badge>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      No restart required · CPU Sampling + Thread dump · Overhead ~1–3%
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  profileMode === 'full'
                    ? 'border-red-500/50 bg-red-500/5'
                    : 'border-[var(--border-default)] hover:border-[var(--border-muted)]'
                }`}>
                  <input
                    type="radio"
                    name="mode"
                    value="full"
                    checked={profileMode === 'full'}
                    onChange={() => setProfileMode('full')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]">
                      <span className="text-red-400">🔴</span>
                      Full Install Mode
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      App restart required · Full method-level instrumentation · Overhead ~3–8%
                    </p>
                    <p className="text-[10px] text-yellow-400 mt-1">
                      ⚠️ Will activate on next app restart
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Profile type */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Profile Type</label>
              <div className="grid grid-cols-4 gap-1">
                {PROFILE_TYPES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setProfileType(id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded border text-[10px] transition-colors ${
                      profileType === id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-muted)]'
                    }`}
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">Duration (s)</label>
              <input
                type="number"
                value={durationSec}
                onChange={(e) => setDurationSec(Math.max(5, Math.min(300, parseInt(e.target.value) || 30)))}
                className="w-20 text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1 text-[var(--text-primary)]"
                min={5}
                max={300}
              />
              <span className="text-[10px] text-[var(--text-muted)]">5–300 seconds</span>
            </div>

            {/* Error */}
            {attachError && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                <AlertTriangle size={12} />
                {attachError}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleAttach}
                disabled={!selectedProcess}
                className="flex-1 text-xs"
              >
                <Zap size={12} className="mr-1.5" />
                Start Profiling
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setSelectedProcess(null); setAttachError(null); }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity size={14} />
            Attach Sessions
            <button
              onClick={loadSessions}
              className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <RefreshCw size={13} />
            </button>
          </CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-muted)]">
                <th className="text-left px-3 py-2 font-medium">Session</th>
                <th className="text-left px-3 py-2 font-medium">Process</th>
                <th className="text-left px-3 py-2 font-medium">Runtime</th>
                <th className="text-right px-3 py-2 font-medium">PID</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Latest Profile</th>
                <th className="text-left px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((sess) => {
                const meta = RUNTIME_META[sess.runtime as Runtime] ?? { label: sess.runtime, color: '#888', icon: '?' };
                const isProfileRunning = profiling[sess.session_id];
                return (
                  <tr key={sess.session_id} className="border-b border-[var(--border-muted)] hover:bg-[var(--bg-secondary)]">
                    <td className="px-3 py-2 font-mono text-[var(--text-muted)]">{sess.session_id}</td>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{sess.service_name || '-'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                        style={{ background: meta.color }}
                      >
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--text-secondary)]">{sess.pid}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <SessionStatusBadge status={sess.status} />
                        {sess.error_code && (
                          <p className="text-[10px] text-red-400 font-mono">{sess.error_code}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {sess.latest_profile ? (
                        <div className="text-[10px] space-y-0.5">
                          <div className="font-medium text-[var(--text-primary)]">
                            {sess.latest_profile.profile_type.toUpperCase()} · {sess.latest_profile.format}
                          </div>
                          <div className="text-[var(--text-muted)]">
                            {(sess.latest_profile.size_bytes / 1024).toFixed(0)} KB · {sess.latest_profile.duration_sec}s
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {sess.status === 'active' && (
                          <button
                            onClick={() => handleProfile(sess.session_id)}
                            disabled={isProfileRunning}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25 disabled:opacity-50 transition-colors"
                          >
                            {isProfileRunning ? (
                              <><Loader2 size={9} className="animate-spin" /> Profiling…</>
                            ) : (
                              <><Cpu size={9} /> Profile</>
                            )}
                          </button>
                        )}
                        {sess.status !== 'detached' && (
                          <button
                            onClick={() => handleDetach(sess.session_id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            <ZapOff size={9} /> Detach
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[var(--text-muted)]">
                    No active attach sessions. Select a process and click &ldquo;Start Profiling&rdquo;.
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
