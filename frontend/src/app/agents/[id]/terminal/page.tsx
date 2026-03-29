'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/monitoring';
import {
  Terminal,
  Play,
  Square,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Shield,
  Clock,
  Lock,
  Maximize2,
  Minimize2,
  Copy,
  RotateCcw,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type SessionState = 'idle' | 'connecting' | 'active' | 'closed' | 'error';

interface TerminalSession {
  id: string;
  state: SessionState;
  userId: string;
  role: string;
  createdAt: string;
  lastActivity: string;
  commandCount: number;
  idleTimeout: number;
  maxDuration: number;
}

interface AuditEntry {
  timestamp: string;
  type: 'command' | 'output' | 'session_open' | 'session_close' | 'blocked';
  content: string;
  user: string;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCKED_COMMANDS = ['rm -rf /', 'mkfs', 'dd if=/dev/zero', ':(){:|:&};:', 'shutdown', 'reboot', 'halt', 'init 0'];

const STATE_META: Record<SessionState, { label: string; color: string; icon: React.ElementType }> = {
  idle:       { label: 'Idle',        color: 'var(--text-muted)',       icon: Terminal },
  connecting: { label: 'Connecting',  color: 'var(--status-warning)',   icon: Loader2 },
  active:     { label: 'Active',      color: 'var(--status-healthy)',   icon: CheckCircle2 },
  closed:     { label: 'Closed',      color: 'var(--text-muted)',       icon: Square },
  error:      { label: 'Error',       color: 'var(--status-critical)',  icon: AlertTriangle },
};

// ── Demo simulation ─────────────────────────────────────────────────────────

const DEMO_RESPONSES: Record<string, string> = {
  'whoami': 'aitop-agent',
  'hostname': 'prod-app-server-01',
  'uname -a': 'Linux prod-app-server-01 6.1.0-18-amd64 #1 SMP x86_64 GNU/Linux',
  'uptime': ' 14:32:01 up 45 days, 3:21, 1 user, load average: 0.42, 0.38, 0.35',
  'date': new Date().toString(),
  'pwd': '/home/aitop-agent',
  'df -h': `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   32G   16G  67% /
tmpfs           7.8G  1.2M  7.8G   1% /dev/shm
/dev/sdb1       200G  145G   46G  76% /data`,
  'free -h': `              total        used        free      shared  buff/cache   available
Mem:           15Gi       8.2Gi       2.1Gi       256Mi       5.1Gi       6.8Gi
Swap:         4.0Gi       512Mi       3.5Gi`,
  'ps aux --sort=-%cpu | head -10': `USER       PID %CPU %MEM    VSZ   RSS TTY STAT START   TIME COMMAND
root      1234 12.3  4.5 2847532 741216 ?  Sl   Mar01 245:32 java -jar order-service.jar
root      2345  8.7  2.1 1234568 345678 ?  Sl   Mar01 172:15 dotnet PaymentAPI.dll
aitop     3456  5.2  1.8  987654 298765 ?  Sl   Mar01  98:43 ./metrics-exporter
root      4567  3.1  3.2 1567890 524288 ?  Sl   Mar01  61:22 node api-gateway/index.js
root      5678  2.8  1.5  876543 245760 ?  Sl   Mar01  55:18 python ml-inference/serve.py
root      6789  1.2  0.8  456789 131072 ?  Ssl  Mar01  23:45 go-service
root         1  0.0  0.0  168956  12288 ?  Ss   Feb14   0:15 /sbin/init
root       102  0.0  0.1   74892  16384 ?  Ss   Feb14   0:42 /usr/sbin/sshd
root       203  0.0  0.1  234567  20480 ?  Ssl  Feb14   1:23 /usr/bin/containerd
root       304  0.0  0.0   45678   8192 ?  Ss   Feb14   0:08 /usr/sbin/cron`,
  'netstat -tlnp | head -15': `Proto Recv-Q Send-Q Local Address     Foreign Address   State       PID/Program name
tcp        0      0 0.0.0.0:8081      0.0.0.0:*         LISTEN      1234/java
tcp        0      0 0.0.0.0:8082      0.0.0.0:*         LISTEN      2345/dotnet
tcp        0      0 0.0.0.0:8083      0.0.0.0:*         LISTEN      6789/go-service
tcp        0      0 0.0.0.0:8084      0.0.0.0:*         LISTEN      5678/python
tcp        0      0 0.0.0.0:8085      0.0.0.0:*         LISTEN      4567/node
tcp        0      0 0.0.0.0:6060      0.0.0.0:*         LISTEN      3456/metrics-exp
tcp        0      0 0.0.0.0:22        0.0.0.0:*         LISTEN      102/sshd
tcp        0      0 0.0.0.0:5432      0.0.0.0:*         LISTEN      789/postgres`,
  'docker ps': `CONTAINER ID   IMAGE                    COMMAND                  STATUS          PORTS                    NAMES
a1b2c3d4e5f6   demo-site/java-app       "java -javaagent:..."    Up 2 days       0.0.0.0:8081->8081/tcp   demo-java-app
b2c3d4e5f6a7   demo-site/dotnet-app     "dotnet DemoApp.dll"     Up 2 days       0.0.0.0:8082->8082/tcp   demo-dotnet-app
c3d4e5f6a7b8   demo-site/go-app         "./go-demo-app"          Up 2 days       0.0.0.0:8083->8083/tcp   demo-go-app
d4e5f6a7b8c9   demo-site/python-app     "uvicorn main:app..."    Up 2 days       0.0.0.0:8084->8084/tcp   demo-python-app
e5f6a7b8c9d0   demo-site/nodejs-app     "node app.js"            Up 2 days       0.0.0.0:8085->8085/tcp   demo-node-app`,
  'systemctl status aitop-agent': `● aitop-agent.service - AITOP Monitoring Agent
     Loaded: loaded (/etc/systemd/system/aitop-agent.service; enabled)
     Active: active (running) since Tue 2026-02-12 11:10:35 KST; 45 days ago
   Main PID: 9876 (aitop-agent)
      Tasks: 24 (limit: 38000)
     Memory: 86.3M
        CPU: 2h 34min 12.345s
     CGroup: /system.slice/aitop-agent.service
             └─9876 /opt/aitop/bin/aitop-agent --mode=full --config=/etc/aitop/agent.yaml`,
  'cat /etc/aitop/agent.yaml': `agent:
  mode: full
  id: agent-prod-01
server:
  url: https://aitop-server.internal:8080
  project_token: "****"
schedule:
  default: "0 */6 * * *"
  metrics: "*/60 * * * * *"
collectors:
  os: auto
  web: auto
  was: auto
  db: true
  ai: auto
remote_shell:
  enabled: true
  max_sessions: 3
  idle_timeout: 600
  audit_logging: true
  blocked_commands:
    - "rm -rf /"
    - "mkfs"
    - "shutdown"`,
  'top -bn1 | head -5': `top - 14:32:01 up 45 days,  3:21,  1 user,  load average: 0.42, 0.38, 0.35
Tasks: 186 total,   2 running, 184 sleeping,   0 stopped,   0 zombie
%Cpu(s): 12.3 us,  2.1 sy,  0.0 ni, 84.2 id,  1.0 wa,  0.0 hi,  0.4 si
MiB Mem :  16076.4 total,   2156.8 free,   8396.2 used,   5523.4 buff/cache
MiB Swap:   4096.0 total,   3584.0 free,    512.0 used.   6963.2 avail Mem`,
  'curl -s http://localhost:8081/api/health': '{"status":"UP","service":"java-demo-app","uptime":"45d 3h 21m"}',
  'curl -s http://localhost:8082/api/health': '{"status":"Healthy","service":"dotnet-demo-app","uptime":"45.03:21:00"}',
  'curl -s http://localhost:8083/api/health': '{"status":"ok","service":"go-demo-app","uptime_sec":3905460}',
  'curl -s http://localhost:8084/api/health': '{"status":"ok","service":"python-demo-app","uptime_sec":3905460}',
  'curl -s http://localhost:8085/api/health': '{"status":"ok","service":"nodejs-demo-app","uptime_sec":3905460}',
  'help': `Available commands:
  whoami, hostname, uname -a, uptime, date, pwd
  df -h, free -h, top, ps aux
  netstat -tlnp, docker ps
  systemctl status aitop-agent
  cat /etc/aitop/agent.yaml
  curl -s http://localhost:<port>/health
  clear, help`,
};

function simulateResponse(cmd: string): string {
  const trimmed = cmd.trim();
  if (trimmed === '') return '';
  if (trimmed === 'clear') return '__CLEAR__';

  // Check blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (trimmed.startsWith(blocked)) {
      return `\x1b[31m⛔ Command blocked by security policy: "${trimmed}"\x1b[0m\nThis command is restricted by RBAC. Contact your administrator.`;
    }
  }

  // Exact match
  if (DEMO_RESPONSES[trimmed]) return DEMO_RESPONSES[trimmed];

  // Partial match
  for (const [key, val] of Object.entries(DEMO_RESPONSES)) {
    if (trimmed.startsWith(key.split(' ')[0]) && key.includes(trimmed.split(' ')[0])) {
      return val;
    }
  }

  return `bash: ${trimmed.split(' ')[0]}: command not found`;
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function AgentTerminalPage() {
  const { id: agentId } = useParams<{ id: string }>();

  const [session, setSession] = useState<TerminalSession | null>(null);
  const [state, setState] = useState<SessionState>('idle');
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [commandCount, setCommandCount] = useState(0);

  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lineIdRef = useRef(0);

  const nextId = () => ++lineIdRef.current;
  const now = () => new Date().toISOString();

  // Auto-scroll
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input on terminal click
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Connect session
  const handleConnect = useCallback(async () => {
    setState('connecting');
    setLines([{ id: nextId(), type: 'system', content: `Connecting to agent ${agentId}...`, timestamp: now() }]);

    // Simulate connection delay
    await new Promise((r) => setTimeout(r, 1200));

    const sess: TerminalSession = {
      id: `ts-${Date.now().toString(36)}`,
      state: 'active',
      userId: 'admin@aitop.io',
      role: 'admin',
      createdAt: now(),
      lastActivity: now(),
      commandCount: 0,
      idleTimeout: 600,
      maxDuration: 3600,
    };

    setSession(sess);
    setState('active');
    setAuditLog((prev) => [...prev, { timestamp: now(), type: 'session_open', content: `Session ${sess.id} opened`, user: sess.userId }]);
    setLines((prev) => [
      ...prev,
      { id: nextId(), type: 'system', content: `Connected to ${agentId} (session: ${sess.id})`, timestamp: now() },
      { id: nextId(), type: 'system', content: `Remote Shell — RBAC: admin | Audit: enabled | Idle timeout: 600s | Max duration: 3600s`, timestamp: now() },
      { id: nextId(), type: 'system', content: `Type "help" for available commands. Blocked commands are enforced by security policy.`, timestamp: now() },
      { id: nextId(), type: 'output', content: '', timestamp: now() },
    ]);
  }, [agentId]);

  // Disconnect
  const handleDisconnect = useCallback(() => {
    if (session) {
      setAuditLog((prev) => [...prev, { timestamp: now(), type: 'session_close', content: `Session ${session.id} closed`, user: session.userId }]);
    }
    setState('closed');
    setLines((prev) => [...prev, { id: nextId(), type: 'system', content: 'Session closed.', timestamp: now() }]);
    setSession(null);
  }, [session]);

  // Execute command
  const handleCommand = useCallback(async (cmd: string) => {
    if (state !== 'active' || !cmd.trim()) return;

    const trimmed = cmd.trim();
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);
    setCommandCount((c) => c + 1);

    // Audit
    setAuditLog((prev) => [...prev, { timestamp: now(), type: 'command', content: trimmed, user: session?.userId ?? 'unknown' }]);

    // Input line
    setLines((prev) => [...prev, { id: nextId(), type: 'input', content: `$ ${trimmed}`, timestamp: now() }]);

    // Simulate processing delay
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 300));

    const response = simulateResponse(trimmed);
    if (response === '__CLEAR__') {
      setLines([]);
      return;
    }
    if (response) {
      // Check if blocked
      const isBlocked = response.includes('⛔ Command blocked');
      if (isBlocked) {
        setAuditLog((prev) => [...prev, { timestamp: now(), type: 'blocked', content: trimmed, user: session?.userId ?? 'unknown' }]);
      }
      setLines((prev) => [...prev, {
        id: nextId(),
        type: isBlocked ? 'error' : 'output',
        content: response,
        timestamp: now(),
      }]);
    }
  }, [state, session]);

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(idx);
        setInput(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const idx = historyIdx + 1;
        if (idx >= history.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(idx);
          setInput(history[idx]);
        }
      }
    }
  };

  // Copy output
  const handleCopy = () => {
    const text = lines.map((l) => l.content).join('\n');
    navigator.clipboard.writeText(text);
  };

  const StatIcon = STATE_META[state].icon;
  const blockedCount = auditLog.filter((a) => a.type === 'blocked').length;

  return (
    <div className={`space-y-4 ${fullscreen ? 'fixed inset-0 z-50 bg-[var(--bg-primary)] p-4 overflow-auto' : ''}`}>
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Agents', href: '/agents' },
          { label: agentId, href: '/agents' },
          { label: 'Remote Terminal', icon: <Terminal size={14} /> },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Remote Terminal</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Secure PTY shell session — RBAC enforced, audit logged, command filtering active
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state === 'idle' || state === 'closed' || state === 'error' ? (
            <Button onClick={handleConnect} className="text-xs">
              <Play size={12} className="mr-1.5" /> Connect
            </Button>
          ) : (
            <Button variant="secondary" onClick={handleDisconnect} className="text-xs">
              <Square size={12} className="mr-1.5" /> Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard
          helpId="terminal-session-state"
          title="Session State"
          value={STATE_META[state].label}
          subtitle={session?.id ?? 'no session'}
          status={state === 'active' ? 'healthy' : state === 'error' ? 'critical' : undefined}
        />
        <KPICard helpId="terminal-commands" title="Commands" value={commandCount} subtitle="executed" status="healthy" />
        <KPICard helpId="terminal-audit-entries" title="Audit Entries" value={auditLog.length} subtitle="logged" status="healthy" />
        <KPICard
          helpId="terminal-blocked"
          title="Blocked"
          value={blockedCount}
          subtitle="security filtered"
          status={blockedCount > 0 ? 'warning' : 'healthy'}
        />
        <KPICard
          helpId="terminal-session-role"
          title="Role"
          value={session?.role ?? '—'}
          subtitle="RBAC"
          status="healthy"
        />
      </div>

      {/* Terminal + Audit */}
      <div className={`grid gap-4 ${showAudit ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>

        {/* Terminal Card */}
        <Card padding="none" className={showAudit ? 'lg:col-span-2' : ''}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2">
              <Terminal size={13} className="text-[var(--accent-primary)]" />
              <span className="text-xs font-medium text-[var(--text-primary)]">Terminal</span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: STATE_META[state].color }}>
                <StatIcon size={10} className={state === 'connecting' ? 'animate-spin' : ''} />
                {STATE_META[state].label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Copy output"
              >
                <Copy size={12} />
              </button>
              <button
                onClick={() => setShowAudit(!showAudit)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Toggle audit log"
              >
                <Shield size={12} />
              </button>
              <button
                onClick={() => setFullscreen(!fullscreen)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Toggle fullscreen"
              >
                {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
          </div>

          {/* Terminal body */}
          <div
            ref={termRef}
            onClick={focusInput}
            className="bg-[#0d1117] text-[#c9d1d9] font-mono text-xs p-3 overflow-auto cursor-text"
            style={{ minHeight: 400, maxHeight: fullscreen ? 'calc(100vh - 240px)' : 500 }}
          >
            {lines.map((line) => (
              <div key={line.id} className="leading-5">
                {line.type === 'input' && (
                  <span className="text-[#58a6ff]">{line.content}</span>
                )}
                {line.type === 'output' && (
                  <span className="text-[#c9d1d9] whitespace-pre-wrap">{line.content}</span>
                )}
                {line.type === 'error' && (
                  <span className="text-[#f85149] whitespace-pre-wrap">{line.content}</span>
                )}
                {line.type === 'system' && (
                  <span className="text-[#8b949e] italic">{line.content}</span>
                )}
              </div>
            ))}

            {/* Input prompt */}
            {state === 'active' && (
              <div className="flex items-center leading-5">
                <span className="text-[#3fb950] mr-1">aitop@{agentId}</span>
                <span className="text-[#58a6ff] mr-1">$</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent text-[#c9d1d9] outline-none caret-[#58a6ff] font-mono text-xs"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            )}

            {state === 'idle' && (
              <div className="text-[#8b949e] text-center py-8">
                Click &ldquo;Connect&rdquo; to open a remote shell session to agent {agentId}
              </div>
            )}
          </div>
        </Card>

        {/* Audit Log Panel */}
        {showAudit && (
          <Card padding="none">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-[var(--status-warning)]" />
                <span className="text-xs font-medium text-[var(--text-primary)]">Audit Log</span>
                <Badge>{auditLog.length}</Badge>
              </div>
              <button
                onClick={() => {
                  const text = auditLog.map((a) => `[${a.timestamp}] ${a.type}: ${a.content} (${a.user})`).join('\n');
                  const blob = new Blob([text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `audit-${agentId}-${Date.now()}.log`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Download audit log"
              >
                <Download size={12} />
              </button>
            </div>

            <div className="overflow-auto" style={{ maxHeight: fullscreen ? 'calc(100vh - 240px)' : 500 }}>
              {auditLog.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  No audit entries yet. Connect to start recording.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-muted)]">
                  {auditLog.map((entry, i) => {
                    const typeColor = {
                      command: 'text-[var(--accent-primary)]',
                      output: 'text-[var(--text-muted)]',
                      session_open: 'text-[var(--status-healthy)]',
                      session_close: 'text-[var(--text-muted)]',
                      blocked: 'text-[var(--status-critical)]',
                    }[entry.type];
                    return (
                      <div key={i} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={`text-[10px] font-medium ${typeColor}`}>
                            {entry.type === 'blocked' && <Lock className="inline" size={9} />}
                            {entry.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5 break-all">
                          {entry.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Security Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield size={14} />
            Security & Configuration
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 pb-4">
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-[var(--text-primary)]">RBAC Settings</h3>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Max Concurrent Sessions</span>
                <span className="text-[var(--text-secondary)] font-mono">3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Idle Timeout</span>
                <span className="text-[var(--text-secondary)] font-mono">600s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Max Session Duration</span>
                <span className="text-[var(--text-secondary)] font-mono">3600s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Audit Logging</span>
                <span className="text-[var(--status-healthy)] font-medium">Enabled</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-[var(--text-primary)]">Blocked Commands</h3>
            <div className="flex flex-wrap gap-1">
              {BLOCKED_COMMANDS.map((cmd) => (
                <span key={cmd} className="px-1.5 py-0.5 text-[10px] font-mono bg-red-500/10 text-red-400 rounded">
                  {cmd}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-[var(--text-primary)]">Platform Support</h3>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Linux/macOS</span>
                <span className="text-[var(--text-secondary)]">Native PTY (Unix Socket)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Windows</span>
                <span className="text-[var(--text-secondary)]">ConPTY</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Transport</span>
                <span className="text-[var(--text-secondary)]">WebSocket + gRPC proxy</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
