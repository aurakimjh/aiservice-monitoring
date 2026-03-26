'use client';

// Phase 39-5: Thread Dump Viewer with Virtual Thread tab
//
// Route: /infra/middleware/thread-dump
//
// Tabs:
//   - Platform Threads — traditional OS threads
//   - Virtual Threads  — JDK 21 VirtualThread instances (RUNNING/WAITING/BLOCKED filter)

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardHeader, CardTitle, Badge, SearchInput } from '@/components/ui';
import { KPICard } from '@/components/monitoring';
import { Server, Layers, Cpu, Pin, Zap, Filter, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Demo thread dump data ────────────────────────────────────────────────────

interface ThreadEntry {
  name: string;
  state: 'RUNNING' | 'WAITING' | 'BLOCKED' | 'TERMINATED';
  stack: string[];
  isVirtual: boolean;
  durationMs?: number;
}

function getDemoThreadDump(): { total: number; platform: ThreadEntry[]; virtual: ThreadEntry[]; capturedAt: string; javaVersion: string } {
  const platformThreads: ThreadEntry[] = [
    { name: 'main', state: 'WAITING', stack: ['java.lang.Object.wait(Object.java)', 'com.example.App.main(App.java:42)'], isVirtual: false },
    { name: 'http-nio-8080-exec-1', state: 'RUNNING', stack: ['com.example.Handler.handle(Handler.java:12)', 'org.apache.coyote.AbstractProcessor.process(AbstractProcessor.java:65)'], isVirtual: false },
    { name: 'http-nio-8080-exec-2', state: 'WAITING', stack: ['sun.misc.Unsafe.park(Unsafe.java)', 'java.util.concurrent.locks.LockSupport.park(LockSupport.java:211)'], isVirtual: false },
    { name: 'GC-Thread-0', state: 'RUNNING', stack: ['[GC thread internal]'], isVirtual: false },
    { name: 'Finalizer', state: 'WAITING', stack: ['java.lang.ref.ReferenceQueue.remove(ReferenceQueue.java:155)', 'java.lang.ref.Finalizer$FinalizerThread.run(Finalizer.java:216)'], isVirtual: false },
    { name: 'Signal-Dispatcher', state: 'RUNNING', stack: ['[signal dispatcher thread]'], isVirtual: false },
  ];

  // 50 demo Virtual Threads
  const vtStates: ('RUNNING' | 'WAITING' | 'BLOCKED')[] = ['RUNNING', 'WAITING', 'WAITING', 'WAITING', 'BLOCKED'];
  const vtMethods = [
    ['java.lang.VirtualThread.park(VirtualThread.java)', 'com.example.AsyncService.fetchData(AsyncService.java:88)', 'com.example.RequestHandler.handle(RequestHandler.java:34)'],
    ['java.net.Socket.read(SocketInputStream.java)', 'com.example.DbClient.query(DbClient.java:55)', 'com.example.UserRepository.findById(UserRepository.java:22)'],
    ['java.lang.Object.wait(Object.java)', 'com.example.LegacySync.acquire(LegacySync.java:42)', 'com.example.RequestHandler.handle(RequestHandler.java:34)'],
    ['sun.nio.ch.Poller.poll(Poller.java)', 'java.nio.channels.SocketChannel.read(SocketChannel.java)', 'com.example.HttpClient.get(HttpClient.java:67)'],
    ['java.lang.VirtualThread.park(VirtualThread.java)', 'java.util.concurrent.CompletableFuture.get(CompletableFuture.java)', 'com.example.OrderService.process(OrderService.java:99)'],
  ];

  const virtualThreads: ThreadEntry[] = Array.from({ length: 50 }, (_, i) => ({
    name: `VirtualThread-${i + 1}`,
    state: vtStates[i % vtStates.length],
    stack: vtMethods[i % vtMethods.length],
    isVirtual: true,
    durationMs: i % 5 === 2 ? 245.8 + i * 10 : undefined, // some pinned
  }));

  return {
    total: platformThreads.length + virtualThreads.length,
    platform: platformThreads,
    virtual: virtualThreads,
    capturedAt: new Date().toISOString(),
    javaVersion: '21.0.2',
  };
}

// ─── State badge ──────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cls = {
    RUNNING: 'bg-green-500/15 text-green-400 border-green-500/30',
    WAITING: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    BLOCKED: 'bg-red-500/15 text-red-400 border-red-500/30',
    TERMINATED: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-[var(--border-muted)]',
  }[state] ?? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]';

  return (
    <Badge variant="status" className={cn('text-[9px] font-mono uppercase', cls)}>
      {state}
    </Badge>
  );
}

// ─── Thread row ───────────────────────────────────────────────────────────────

function ThreadRow({ thread }: { thread: ThreadEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-[var(--border-muted)] last:border-0">
      <button
        className="w-full flex items-center gap-3 py-2 px-3 hover:bg-[var(--bg-tertiary)] transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={12} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={12} className="shrink-0 text-[var(--text-muted)]" />}
        <span className="text-xs font-mono text-[var(--text-secondary)] flex-1 truncate">{thread.name}</span>
        {thread.isVirtual && thread.durationMs && (
          <span className="text-[10px] text-[var(--status-warning)] tabular-nums shrink-0 flex items-center gap-1">
            <Pin size={9} /> {thread.durationMs.toFixed(0)}ms pinned
          </span>
        )}
        <StateBadge state={thread.state} />
      </button>
      {expanded && thread.stack.length > 0 && (
        <div className="px-7 pb-2">
          <pre className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded-lg p-2 overflow-x-auto leading-relaxed">
            {thread.stack.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type DumpTab = 'virtual' | 'platform';
type StateFilter = 'ALL' | 'RUNNING' | 'WAITING' | 'BLOCKED';

export default function ThreadDumpPage() {
  const dump = useMemo(() => getDemoThreadDump(), []);
  const [tab, setTab] = useState<DumpTab>('virtual');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [search, setSearch] = useState('');

  const threads = tab === 'virtual' ? dump.virtual : dump.platform;
  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (stateFilter !== 'ALL' && t.state !== stateFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
          !t.stack.some((s) => s.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [threads, stateFilter, search]);

  const vtCounts = useMemo(() => {
    const r = { running: 0, waiting: 0, blocked: 0 };
    dump.virtual.forEach((t) => {
      if (t.state === 'RUNNING') r.running++;
      else if (t.state === 'WAITING') r.waiting++;
      else if (t.state === 'BLOCKED') r.blocked++;
    });
    return r;
  }, [dump.virtual]);

  const STATE_FILTERS: StateFilter[] = ['ALL', 'RUNNING', 'WAITING', 'BLOCKED'];

  return (
    <div className="space-y-4">
      <Breadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Infrastructure', href: '/infra', icon: <Server size={14} /> },
        { label: 'Middleware Runtime', href: '/infra/middleware', icon: <Layers size={14} /> },
        { label: 'Thread Dump', icon: <Cpu size={14} /> },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Thread Dump</h1>
          <Badge variant="status" className="text-[10px] bg-orange-500/15 text-orange-300 border-orange-500/30 font-mono">
            JDK {dump.javaVersion}
          </Badge>
          <Badge variant="status" className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30">
            Virtual Threads
          </Badge>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">
          Captured {new Date(dump.capturedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title="Total Threads" value={dump.total} status="healthy" />
        <KPICard title="Virtual Threads" value={dump.virtual.length} status="healthy" />
        <KPICard title="VT Running" value={vtCounts.running} status="healthy" />
        <KPICard title="VT Blocked" value={vtCounts.blocked} status={vtCounts.blocked > 0 ? 'warning' : 'healthy'} />
      </div>

      {/* Tab selector */}
      <div className="flex gap-1">
        {(['virtual', 'platform'] as DumpTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5',
              tab === t
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {t === 'virtual' ? <><Zap size={11} />Virtual Threads</> : <><Cpu size={11} />Platform Threads</>}
            <span className="ml-1 text-[10px] opacity-70">
              {t === 'virtual' ? dump.virtual.length : dump.platform.length}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap w-full">
            <CardTitle>{tab === 'virtual' ? 'Virtual Threads' : 'Platform Threads'}</CardTitle>
            <Badge variant="status" status="healthy">{filtered.length} shown</Badge>
            <div className="flex-1" />
            {/* State filter — Virtual Threads only */}
            {tab === 'virtual' && (
              <div className="flex gap-1">
                {STATE_FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setStateFilter(f)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[10px] font-medium transition-colors',
                      stateFilter === f
                        ? f === 'RUNNING' ? 'bg-green-500/20 text-green-400'
                          : f === 'WAITING' ? 'bg-yellow-500/20 text-yellow-400'
                          : f === 'BLOCKED' ? 'bg-red-500/20 text-red-400'
                          : 'bg-[var(--accent-primary)] text-white'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Filter size={9} className="inline mr-1" />
                    {f}
                  </button>
                ))}
              </div>
            )}
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name / method…"
              className="w-48 text-xs"
            />
          </div>
        </CardHeader>
        <div className="divide-y divide-[var(--border-muted)]">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">No threads match the current filter.</div>
          ) : (
            filtered.map((t) => <ThreadRow key={t.name} thread={t} />)
          )}
        </div>
      </Card>

      {tab === 'virtual' && vtCounts.blocked > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
          <Pin size={12} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">{vtCounts.blocked} Virtual Thread(s) BLOCKED</span> — these threads are pinned to their Carrier Thread, preventing other Virtual Threads from executing on that carrier.
            Refactor <code className="font-mono">synchronized</code> blocks to use <code className="font-mono">ReentrantLock</code> or avoid blocking native calls.
          </div>
        </div>
      )}
    </div>
  );
}
