'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { AuthGuard } from '@/components/auth';
import { Sidebar, TopBar, StatusBar, CommandPalette } from '@/components/layout';

// Login page renders without the shell
const NO_SHELL_PATHS = ['/login'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const expanded = useUIStore((s) => s.sidebarExpanded);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const isNoShell = NO_SHELL_PATHS.some((p) => pathname.startsWith(p));

  return (
    <AuthGuard>
      {isNoShell || !isAuthenticated ? (
        // Login page — full-screen, no shell
        <>{children}</>
      ) : (
        // Authenticated — full shell with sidebar, topbar, statusbar
        <div className="h-full flex flex-col">
          <TopBar />
          <Sidebar />

          <main
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
