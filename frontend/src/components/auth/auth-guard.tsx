'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import type { Role } from '@/types/auth';
import { ROLE_HIERARCHY } from '@/types/auth';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui';

// Pages that don't require authentication
const PUBLIC_PATHS = ['/login'];

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();

  // Hydrate loading state on mount
  useEffect(() => {
    setLoading(false);
  }, [setLoading]);

  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
    }
    if (isAuthenticated && pathname === '/login') {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!isAuthenticated && !isPublic) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

// ── Role-based access wrapper ──
interface RequireRoleProps {
  minRole: Role;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireRole({ minRole, children, fallback }: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;
  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
    return fallback ? <>{fallback}</> : <AccessDenied />;
  }

  return <>{children}</>;
}

// ── Permission-based access wrapper ──
interface RequirePermissionProps {
  resource: string;
  action: 'read' | 'write' | 'delete' | 'admin';
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ resource, action, children, fallback }: RequirePermissionProps) {
  const canAccess = useAuthStore((s) => s.canAccess);

  if (!canAccess(resource, action)) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}

// ── Loading screen ──
function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--text-muted)]">Loading...</span>
      </div>
    </div>
  );
}

// ── Access Denied ──
function AccessDenied() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <ShieldAlert size={48} className="text-[var(--status-warning)]" />
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Access Denied</h2>
      <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm">
        Your role (<span className="font-medium">{user?.role}</span>) does not have
        permission to access this page. Contact an administrator for access.
      </p>
      <Button variant="secondary" onClick={() => router.back()}>
        Go Back
      </Button>
    </div>
  );
}
