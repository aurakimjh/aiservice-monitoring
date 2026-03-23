'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useI18n } from '@/hooks/use-i18n';
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
  AlertTriangle,
} from 'lucide-react';
import { Tooltip } from '@/components/ui';

interface NavItem {
  icon: React.ElementType;
  i18nKey: string;
  href: string;
  dividerBefore?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home, i18nKey: 'nav.home', href: '/' },
  { icon: FolderOpen, i18nKey: 'nav.projects', href: '/projects', dividerBefore: true },
  { icon: Server, i18nKey: 'nav.infra', href: '/infra' },
  { icon: Network, i18nKey: 'nav.services', href: '/services' },
  { icon: Bot, i18nKey: 'nav.ai', href: '/ai' },
  { icon: BarChart3, i18nKey: 'nav.metrics', href: '/metrics', dividerBefore: true },
  { icon: Search, i18nKey: 'nav.traces', href: '/traces' },
  { icon: FileText, i18nKey: 'nav.logs', href: '/logs' },
  { icon: ClipboardList, i18nKey: 'nav.diagnostics', href: '/diagnostics', dividerBefore: true },
  { icon: AlertTriangle, i18nKey: 'nav.anomalies', href: '/anomalies' },
  { icon: Bell, i18nKey: 'nav.alerts', href: '/alerts' },
  { icon: Cpu, i18nKey: 'nav.agents', href: '/agents' },
  { icon: Settings, i18nKey: 'nav.settings', href: '/settings', dividerBefore: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const expanded = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { t } = useI18n();

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
          const label = t(item.i18nKey);

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
                  <span className="truncate">{label}</span>
                </Link>
              ) : (
                <Tooltip content={label} side="right">
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
