import { useAuthStore } from '@/stores/auth-store';
import type { LoginRequest, LoginResponse, User } from '@/types/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1';

// ── Generic fetch wrapper with auth ──
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { tokens, logout, updateTokens } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    // Check expiry (refresh if < 60s remaining)
    if (tokens.expiresAt - Date.now() < 60_000 && tokens.refreshToken) {
      try {
        const refreshed = await refreshTokens(tokens.refreshToken);
        updateTokens(refreshed);
        headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      } catch {
        logout();
        throw new Error('Session expired');
      }
    } else {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

// ── Token refresh ──
async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  return res.json() as Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;
}

// ── Auth API ──
export const authApi = {
  login: (data: LoginRequest) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => apiFetch<User>('/auth/me'),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }).catch(() => {}),
};

// ── Demo/Mock login (개발용 — 백엔드 없이 동작) ──
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  'admin@aitop.io': {
    password: 'admin',
    user: {
      id: 'u-001',
      email: 'admin@aitop.io',
      name: 'Admin',
      role: 'admin',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'sre@aitop.io': {
    password: 'sre',
    user: {
      id: 'u-002',
      email: 'sre@aitop.io',
      name: 'SRE Kim',
      role: 'sre',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'ai@aitop.io': {
    password: 'ai',
    user: {
      id: 'u-003',
      email: 'ai@aitop.io',
      name: 'AI Engineer Park',
      role: 'ai_engineer',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
  'viewer@aitop.io': {
    password: 'viewer',
    user: {
      id: 'u-004',
      email: 'viewer@aitop.io',
      name: 'Viewer Lee',
      role: 'viewer',
      organizationId: 'org-001',
      organizationName: 'AITOP',
    },
  },
};

export async function demoLogin(email: string, password: string): Promise<LoginResponse> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 500));

  const entry = DEMO_USERS[email];
  if (!entry || entry.password !== password) {
    throw new Error('Invalid email or password');
  }

  return {
    user: entry.user,
    tokens: {
      accessToken: `demo-token-${entry.user.id}-${Date.now()}`,
      refreshToken: `demo-refresh-${entry.user.id}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    },
  };
}

export { apiFetch };
