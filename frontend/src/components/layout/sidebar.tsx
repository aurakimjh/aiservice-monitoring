'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import {
  Home,
  FolderOpen,
  Server,
  Network,
  Bot,
  BarChart3,
  Search,
  FileText,
  ClipboardList,
  Bell,
  Cpu,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Tooltip } from '@/components/ui';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  dividerBefore?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: FolderOpen, label: 'Projects', href: '/projects', dividerBefore: true },
  { icon: Server, label: 'Infrastructure', href: '/infra' },
  { icon: Network, label: 'Services (APM)', href: '/services' },
  { icon: Bot, label: 'AI Services', href: '/ai' },
  { icon: BarChart3, label: 'Metrics', href: '/metrics', dividerBefore: true },
  { icon: Search, label: 'Traces', href: '/traces' },
  { icon: FileText, label: 'Logs', href: '/logs' },
  { icon: ClipboardList, label: 'Diagnostics', href: '/diagnostics', dividerBefore: true },
  { icon: Bell, label: 'Alerts', href: '/alerts' },
  { icon: Cpu, label: 'Agents', href: '/agents' },
  { icon: Settings, label: 'Settings', href: '/settings', dividerBefore: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const expanded = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'fixed top-[var(--topbar-height)] left-0 bottom-[var(--statusbar-height)]',
        'bg-[var(--sidebar-bg)] border-r border-[var(--border-default)]',
        'flex flex-col z-30',
        'transition-[width] duration-[var(--transition-slow)]',
        expanded ? 'w-[var(--sidebar-width-expanded)]' : 'w-[var(--sidebar-width-collapsed)]',
      )}
    >
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <div key={item.href}>
              {item.dividerBefore && (
                <div className="mx-3 my-1.5 border-t border-[var(--border-muted)]" />
              )}
              {expanded ? (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 mx-2 px-2.5 py-1.5 rounded-[var(--radius-md)]',
                    'text-[13px] transition-colors',
                    isActive
                      ? 'bg-[var(--sidebar-active)]/15 text-[var(--accent-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)]',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 w-[3px] h-5 bg-[var(--sidebar-active)] rounded-r" />
                  )}
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <Tooltip content={item.label} side="right">
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center justify-center mx-2 py-1.5 rounded-[var(--radius-md)]',
                      'transition-colors',
                      isActive
                        ? 'text-[var(--accent-primary)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)]',
                    )}
                  >
                    <Icon size={18} />
                  </Link>
                </Tooltip>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[var(--border-muted)] p-2">
        <button
          onClick={toggleSidebar}
          className={cn(
            'flex items-center gap-3 w-full px-2.5 py-1.5 rounded-[var(--radius-md)]',
            'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]',
            'transition-colors text-[13px]',
            !expanded && 'justify-center',
          )}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? (
            <>
              <PanelLeftClose size={16} />
              <span>Collapse</span>
            </>
          ) : (
            <PanelLeftOpen size={16} />
          )}
        </button>
      </div>
    </aside>
  );
}
