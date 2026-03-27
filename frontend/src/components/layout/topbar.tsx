'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useProjectStore } from '@/stores/project-store';
import { useAuthStore } from '@/stores/auth-store';
import { LOCALE_CONFIG } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { ROLE_LABELS } from '@/types/auth';
import { Select } from '@/components/ui';
import { Dropdown, DropdownItem, DropdownSeparator, DropdownLabel } from '@/components/ui/dropdown';
import { TIME_RANGES } from '@/types/monitoring';
import {
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  Activity,
  User,
  LogOut,
  Settings,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui';

const DEMO_PROJECTS = [
  { id: 'ai-prod', name: 'AI-Production', env: 'production' as const, status: 'healthy' as const },
  { id: 'ecom-stg', name: 'E-Commerce-Staging', env: 'staging' as const, status: 'warning' as const },
  { id: 'bank-core', name: 'Banking-Core', env: 'production' as const, status: 'healthy' as const },
  { id: 'ml-train', name: 'ML-Training', env: 'development' as const, status: 'critical' as const },
];

const DEMO_ALERTS = [
  { id: '1', severity: 'critical' as const, title: 'GPU_VRAM_Critical', target: 'prod-gpu-03', time: '3m ago' },
  { id: '2', severity: 'warning' as const, title: 'LLM_TTFT_High', target: 'rag-service', time: '15m ago' },
  { id: '3', severity: 'info' as const, title: 'Agent_Update_Available', target: '5 agents', time: '1h ago' },
];

const statusDotColor = {
  healthy: 'bg-[var(--status-healthy)]',
  warning: 'bg-[var(--status-warning)]',
  critical: 'bg-[var(--status-critical)]',
  offline: 'bg-[var(--text-muted)]',
  unknown: 'bg-[var(--text-muted)]',
};

const envBadge = {
  production: 'text-[var(--status-healthy)]',
  staging: 'text-[var(--status-warning)]',
  development: 'text-[var(--status-info)]',
};

const severityIcon = {
  critical: <AlertTriangle size={12} className="text-[var(--status-critical)]" />,
  warning: <AlertTriangle size={12} className="text-[var(--status-warning)]" />,
  info: <Bell size={12} className="text-[var(--status-info)]" />,
};

export function TopBar() {
  const {
    theme,
    setTheme,
    locale,
    setLocale,
    timeRange,
    setTimeRange,
    autoRefresh,
    setAutoRefresh,
    setCommandPaletteOpen,
  } = useUIStore();

  const dataSourceMode = useUIStore((s) => s.dataSourceMode);
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const setLiveMode = useProjectStore((s) => s.setLiveMode);

  // Sync project store with data source mode
  const projectsRef = projects;
  if (dataSourceMode === 'live' && projectsRef.length > 0 && projectsRef[0]?.id === DEMO_PROJECTS[0]?.id) {
    setLiveMode(true);
  } else if (dataSourceMode !== 'live' && projectsRef.length === 0) {
    setLiveMode(false);
  }

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-40',
        'h-[var(--topbar-height)] px-4',
        'bg-[var(--bg-secondary)] border-b border-[var(--border-default)]',
        'flex items-center gap-3',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <Activity size={20} className="text-[var(--accent-primary)]" />
        <span className="text-sm font-bold text-[var(--text-primary)] hidden sm:inline">
          AITOP Monitor
        </span>
      </div>

      {/* Project Selector */}
      <Dropdown
        align="left"
        width={280}
        trigger={
          <div
            className={cn(
              'flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)]',
              'bg-[var(--bg-tertiary)] border border-[var(--border-default)]',
              'text-xs text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]',
              'transition-colors',
            )}
          >
            {currentProject ? (
              <>
                <span className={cn('w-2 h-2 rounded-full', statusDotColor[currentProject.status])} />
                <span className="max-w-[140px] truncate">{currentProject.name}</span>
              </>
            ) : (
              <span className="text-[var(--text-muted)]">No Project</span>
            )}
            <ChevronDown size={12} className="text-[var(--text-muted)]" />
          </div>
        }
      >
        <DropdownLabel>Projects</DropdownLabel>
        {projects.length === 0 ? (
          <DropdownItem disabled>
            <span className="text-[var(--text-muted)] text-xs">No projects (Live mode)</span>
          </DropdownItem>
        ) : (
          projects.map((p) => (
            <DropdownItem
              key={p.id}
              active={p.id === currentProjectId}
              onClick={() => setCurrentProject(p.id)}
              icon={<span className={cn('w-2 h-2 rounded-full', statusDotColor[p.status])} />}
            >
              <div className="flex items-center gap-2">
                <span>{p.name}</span>
                {'env' in p && <span className={cn('text-[10px]', envBadge[(p as { env: string }).env])}>{(p as { env: string }).env}</span>}
              </div>
            </DropdownItem>
          ))
        )}
        <DropdownSeparator />
        <DropdownItem icon={<ExternalLink size={12} />} onClick={() => router.push('/projects')}>
          View all projects
        </DropdownItem>
      </Dropdown>

      {/* Command Palette Trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className={cn(
          'flex-1 max-w-md h-7 px-3',
          'flex items-center gap-2',
          'bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-[var(--radius-md)]',
          'text-xs text-[var(--text-muted)]',
          'hover:border-[var(--border-emphasis)] transition-colors cursor-pointer',
        )}
      >
        <Search size={13} />
        <span className="hidden sm:inline">Search services, hosts, metrics...</span>
        <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded">
          Ctrl+K
        </kbd>
      </button>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {/* Time Range */}
        <Select
          options={TIME_RANGES.map((r) => ({ label: r.label, value: r.value }))}
          value={timeRange.value}
          onChange={(e) => {
            const found = TIME_RANGES.find((r) => r.value === e.target.value);
            if (found) setTimeRange(found);
          }}
        />

        {/* Auto Refresh */}
        <Button
          variant={autoRefresh ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setAutoRefresh(!autoRefresh)}
          title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
        >
          <Activity size={14} className={autoRefresh ? 'text-[var(--status-healthy)]' : ''} />
        </Button>

        {/* Notifications */}
        <Dropdown
          align="right"
          width={340}
          trigger={
            <Button variant="ghost" size="icon" title="Alerts">
              <div className="relative">
                <Bell size={16} />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[var(--status-critical)] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {DEMO_ALERTS.length}
                </span>
              </div>
            </Button>
          }
        >
          <DropdownLabel>Recent Alerts</DropdownLabel>
          {DEMO_ALERTS.map((alert) => (
            <DropdownItem
              key={alert.id}
              icon={severityIcon[alert.severity]}
            >
              <div>
                <div className="text-xs font-medium">{alert.title}</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {alert.target} &middot; {alert.time}
                </div>
              </div>
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <DropdownItem icon={<ExternalLink size={12} />}>
            View all alerts
          </DropdownItem>
        </Dropdown>

        {/* Language Switcher */}
        <Dropdown
          align="right"
          width={140}
          trigger={
            <Button variant="ghost" size="icon" title="Language">
              <span className="text-xs">{LOCALE_CONFIG[locale].flag}</span>
            </Button>
          }
        >
          <DropdownLabel>Language</DropdownLabel>
          {(Object.entries(LOCALE_CONFIG) as [Locale, typeof LOCALE_CONFIG[Locale]][]).map(([key, config]) => (
            <DropdownItem
              key={key}
              active={locale === key}
              onClick={() => setLocale(key)}
              icon={<span className="text-sm">{config.flag}</span>}
            >
              {config.label}
            </DropdownItem>
          ))}
        </Dropdown>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>

        {/* User Menu */}
        <Dropdown
          align="right"
          width={220}
          trigger={
            <button className="w-7 h-7 rounded-full bg-[var(--accent-primary)] text-white text-xs font-semibold flex items-center justify-center hover:brightness-110 transition">
              {initials}
            </button>
          }
        >
          <div className="px-3 py-2 border-b border-[var(--border-muted)]">
            <div className="text-sm font-medium text-[var(--text-primary)]">{user?.name ?? 'User'}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{user?.email}</div>
            <div className="text-[10px] text-[var(--accent-primary)] mt-0.5">
              {user?.role ? ROLE_LABELS[user.role] : ''}
            </div>
          </div>
          <DropdownItem icon={<User size={14} />}>Profile</DropdownItem>
          <DropdownItem icon={<Settings size={14} />} onClick={() => router.push('/settings')}>
            Settings
          </DropdownItem>
          <DropdownItem icon={<HelpCircle size={14} />}>Help & Docs</DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={<LogOut size={14} />} danger onClick={handleLogout}>
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
