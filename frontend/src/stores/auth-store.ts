import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens, Role } from '@/types/auth';
import { ROLE_HIERARCHY, ROLE_PERMISSIONS } from '@/types/auth';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateTokens: (tokens: AuthTokens) => void;

  // Permission checks
  hasRole: (minRole: Role) => boolean;
  canAccess: (resource: string, action: 'read' | 'write' | 'delete' | 'admin') => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,

      login: (user, tokens) =>
        set({ user, tokens, isAuthenticated: true, isLoading: false }),

      logout: () =>
        set({ user: null, tokens: null, isAuthenticated: false, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

      updateTokens: (tokens) => set({ tokens }),

      hasRole: (minRole: Role) => {
        const user = get().user;
        if (!user) return false;
        return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minRole];
      },

      canAccess: (resource: string, action: 'read' | 'write' | 'delete' | 'admin') => {
        const user = get().user;
        if (!user) return false;

        const permissions = ROLE_PERMISSIONS[user.role];
        return permissions.some(
          (p) =>
            (p.resource === '*' || p.resource === resource) &&
            p.actions.includes(action),
        );
      },
    }),
    {
      name: 'aitop-auth',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
