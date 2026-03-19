'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import {
  Search,
  Network,
  Server,
  Bot,
  BarChart3,
  FileText,
  FolderOpen,
  Bell,
  Settings,
  Plus,
  Zap,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';

interface CommandItem {
  id: string;
  icon: React.ElementType;
  label: string;
  description?: string;
  category: 'recent' | 'navigation' | 'service' | 'host' | 'command';
  action: () => void;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const navigate = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [setOpen, router],
  );

  const allItems = useMemo<CommandItem[]>(
    () => [
      // Recent
      { id: 'r1', icon: Network, label: 'rag-service', description: 'LLM Performance', category: 'recent', action: () => navigate('/services/rag-service') },
      { id: 'r2', icon: Server, label: 'prod-gpu-01', description: 'GPU Metrics', category: 'recent', action: () => navigate('/infra/prod-gpu-01') },
      // Navigation
      { id: 'n1', icon: FolderOpen, label: 'Projects', description: 'View all projects', category: 'navigation', action: () => navigate('/projects') },
      { id: 'n2', icon: Server, label: 'Infrastructure', description: 'Hosts & middleware', category: 'navigation', action: () => navigate('/infra') },
      { id: 'n3', icon: Network, label: 'Services (APM)', description: 'Application monitoring', category: 'navigation', action: () => navigate('/services') },
      { id: 'n4', icon: Bot, label: 'AI Services', description: 'LLM, RAG, GPU monitoring', category: 'navigation', action: () => navigate('/ai') },
      { id: 'n5', icon: BarChart3, label: 'Metrics Explorer', description: 'Query & visualize', category: 'navigation', action: () => navigate('/metrics') },
      { id: 'n6', icon: Search, label: 'Traces', description: 'Distributed tracing', category: 'navigation', action: () => navigate('/traces') },
      { id: 'n7', icon: FileText, label: 'Logs', description: 'Log exploration', category: 'navigation', action: () => navigate('/logs') },
      { id: 'n8', icon: Bell, label: 'Alerts', description: 'Alert policies & incidents', category: 'navigation', action: () => navigate('/alerts') },
      { id: 'n9', icon: Settings, label: 'Settings', description: 'Organization & config', category: 'navigation', action: () => navigate('/settings') },
      // Demo Services
      { id: 's1', icon: Network, label: 'rag-service', description: 'FastAPI — P95: 1.8s', category: 'service', action: () => navigate('/services/rag-service') },
      { id: 's2', icon: Network, label: 'api-gateway', description: 'Node.js — P95: 245ms', category: 'service', action: () => navigate('/services/api-gateway') },
      { id: 's3', icon: Bot, label: 'code-assistant', description: 'Claude-3.5 — TTFT: 0.8s', category: 'service', action: () => navigate('/ai/code-assistant') },
      // Demo Hosts
      { id: 'h1', icon: Server, label: 'prod-gpu-01', description: 'Ubuntu 22.04 — GPU A100 x2', category: 'host', action: () => navigate('/infra/prod-gpu-01') },
      { id: 'h2', icon: Server, label: 'prod-gpu-02', description: 'Ubuntu 22.04 — GPU A100 x2', category: 'host', action: () => navigate('/infra/prod-gpu-02') },
      { id: 'h3', icon: Server, label: 'prod-db-01', description: 'RHEL 9 — PostgreSQL', category: 'host', action: () => navigate('/infra/prod-db-01') },
      // Commands
      { id: 'c1', icon: Plus, label: 'Create Dashboard', description: 'New custom dashboard', category: 'command', action: () => navigate('/dashboards/new') },
      { id: 'c2', icon: Plus, label: 'Create Alert Rule', description: 'New alert policy', category: 'command', action: () => navigate('/alerts/new') },
      { id: 'c3', icon: Zap, label: 'Run Diagnostics', description: 'Trigger AITOP scan', category: 'command', action: () => navigate('/diagnostics/run') },
    ],
    [navigate],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q),
    );
  }, [query, allItems]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  // Group items
  const groups: { title: string; items: CommandItem[] }[] = [];
  const categoryTitles: Record<string, string> = {
    recent: 'Recent',
    navigation: 'Navigation',
    service: 'Services',
    host: 'Hosts',
    command: 'Commands',
  };
  const categoryOrder = ['recent', 'navigation', 'service', 'host', 'command'];

  for (const cat of categoryOrder) {
    const items = filtered.filter((i) => i.category === cat);
    if (items.length > 0) {
      groups.push({ title: categoryTitles[cat], items });
    }
  }

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div
        className={cn(
          'relative w-full max-w-xl',
          'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
          'rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]',
          'overflow-hidden',
        )}
        role="dialog"
        aria-label="Command palette"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--border-default)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            placeholder="Search services, hosts, metrics, commands..."
          />
          <kbd className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              No results for &quot;{query}&quot;
            </div>
          )}

          {groups.map((group) => (
            <div key={group.title}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                {group.title}
              </div>
              {group.items.map((item) => {
                const idx = globalIndex++;
                const isActive = idx === activeIndex;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    data-active={isActive}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2 text-left',
                      'transition-colors',
                      isActive
                        ? 'bg-[var(--accent-primary)]/10 text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                    )}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <Icon size={16} className={cn('shrink-0', isActive && 'text-[var(--accent-primary)]')} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.description && (
                        <span className="ml-2 text-xs text-[var(--text-muted)]">{item.description}</span>
                      )}
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <CornerDownLeft size={10} />
                        Open
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 h-8 border-t border-[var(--border-default)] text-[10px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">↑↓</kbd> Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">↵</kbd> Open
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
