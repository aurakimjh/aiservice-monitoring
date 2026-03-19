// ═══════════════════════════════════════════════════════════════
// Authentication & Authorization Types
// ═══════════════════════════════════════════════════════════════

export type Role = 'admin' | 'sre' | 'ai_engineer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// Role → 허용 리소스 매핑
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  sre: 'SRE / DevOps',
  ai_engineer: 'AI Engineer',
  viewer: 'Viewer',
};

// 페이지별 최소 역할 (계층: admin > sre > ai_engineer > viewer)
export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 100,
  sre: 80,
  ai_engineer: 60,
  viewer: 10,
};

export interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'admin')[];
}

// 역할별 권한 매트릭스
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    { resource: '*', actions: ['read', 'write', 'delete', 'admin'] },
  ],
  sre: [
    { resource: 'projects', actions: ['read', 'write'] },
    { resource: 'infra', actions: ['read', 'write'] },
    { resource: 'services', actions: ['read', 'write'] },
    { resource: 'ai', actions: ['read', 'write'] },
    { resource: 'alerts', actions: ['read', 'write', 'delete'] },
    { resource: 'agents', actions: ['read', 'write'] },
    { resource: 'diagnostics', actions: ['read', 'write'] },
    { resource: 'settings', actions: ['read'] },
  ],
  ai_engineer: [
    { resource: 'projects', actions: ['read'] },
    { resource: 'infra', actions: ['read'] },
    { resource: 'services', actions: ['read'] },
    { resource: 'ai', actions: ['read', 'write'] },
    { resource: 'alerts', actions: ['read'] },
    { resource: 'agents', actions: ['read'] },
    { resource: 'diagnostics', actions: ['read'] },
  ],
  viewer: [
    { resource: 'projects', actions: ['read'] },
    { resource: 'infra', actions: ['read'] },
    { resource: 'services', actions: ['read'] },
    { resource: 'ai', actions: ['read'] },
    { resource: 'alerts', actions: ['read'] },
    { resource: 'diagnostics', actions: ['read'] },
  ],
};
