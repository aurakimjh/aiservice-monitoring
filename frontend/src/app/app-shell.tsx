'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { AuthGuard } from '@/components/auth';
import { Sidebar, TopBar, StatusBar, CommandPalette } from '@/components/layout';
import { SkipLink } from '@/components/ui/skip-link';
import { reportWebVitals } from '@/lib/web-vitals';

// Login page renders without the shell
const NO_SHELL_PATHS = ['/login'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const expanded = useUIStore((s) => s.sidebarExpanded);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const isNoShell = NO_SHELL_PATHS.some((p) => pathname.startsWith(p));

  // Report Web Vitals once
  useEffect(() => { reportWebVitals(); }, []);

  return (
    <AuthGuard>
      <SkipLink />
      {isNoShell || !isAuthenticated ? (
        // Login page — full-screen, no shell
        <main id="main-content">{children}</main>
      ) : (
        // Authenticated — full shell with sidebar, topbar, statusbar
        <div className="h-full flex flex-col">
          <TopBar />
          <Sidebar />

          <main
            id="main-content"
            role="main"
            aria-label="Main content"
            className={cn(
              'flex-1 overflow-auto',
              'transition-[margin-left] duration-[var(--transition-slow)]',
              'mt-[var(--topbar-height)] mb-[var(--statusbar-height)]',
              expanded
                ? 'ml-[var(--sidebar-width-expanded)]'
                : 'ml-[var(--sidebar-width-collapsed)]',
            )}
          >
            <div className="p-4">{children}</div>
          </main>

          <StatusBar />
          <CommandPalette />
        </div>
      )}
    </AuthGuard>
  );
}
