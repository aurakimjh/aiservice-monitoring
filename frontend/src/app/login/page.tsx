'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { demoLogin } from '@/lib/api-client';
import { Button, Input } from '@/components/ui';
import { Activity, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';
import type { Role } from '@/types/auth';
import { ROLE_LABELS } from '@/types/auth';

const DEMO_ACCOUNTS: { email: string; password: string; role: Role }[] = [
  { email: 'admin@aitop.io', password: 'admin', role: 'admin' },
  { email: 'sre@aitop.io', password: 'sre', role: 'sre' },
  { email: 'ai@aitop.io', password: 'ai', role: 'ai_engineer' },
  { email: 'viewer@aitop.io', password: 'viewer', role: 'viewer' },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await demoLogin(email, password);
      login(res.user, res.tokens);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (account: typeof DEMO_ACCOUNTS[number]) => {
    setError('');
    setLoading(true);
    try {
      const res = await demoLogin(account.email, account.password);
      login(res.user, res.tokens);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2">
            <Activity size={28} className="text-[var(--accent-primary)]" />
            <span className="text-xl font-bold text-[var(--text-primary)]">AITOP Monitor</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            AI Service Monitoring Platform
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className={cn(
            'p-6 space-y-4',
            'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
            'rounded-[var(--radius-xl)]',
          )}
        >
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Sign in</h2>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs rounded-[var(--radius-md)] bg-[var(--status-critical-bg)] text-[var(--status-critical)] border border-[var(--status-critical)]/20">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        {/* Enterprise SSO (Phase 21-3) */}
        <div
          className={cn(
            'p-4 space-y-3',
            'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
            'rounded-[var(--radius-xl)]',
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Shield size={12} />
            Enterprise SSO
          </div>
          <div className="space-y-2">
            <button
              className={cn(
                'flex items-center justify-center gap-2 w-full py-2 text-xs font-medium',
                'border border-[var(--border-default)] rounded-[var(--radius-md)]',
                'hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-emphasis)]',
                'transition-colors text-[var(--text-primary)]',
              )}
            >
              Sign in with Okta
            </button>
            <button
              className={cn(
                'flex items-center justify-center gap-2 w-full py-2 text-xs font-medium',
                'border border-[var(--border-default)] rounded-[var(--radius-md)]',
                'hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-emphasis)]',
                'transition-colors text-[var(--text-primary)]',
              )}
            >
              Sign in with Microsoft
            </button>
          </div>
        </div>

        {/* Demo Quick Login */}
        <div
          className={cn(
            'p-4 space-y-3',
            'bg-[var(--bg-secondary)] border border-[var(--border-default)]',
            'rounded-[var(--radius-xl)]',
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Shield size={12} />
            Demo Accounts (Quick Login)
          </div>

          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                onClick={() => handleQuickLogin(account)}
                disabled={loading}
                className={cn(
                  'flex flex-col items-start gap-0.5 p-2.5 rounded-[var(--radius-md)]',
                  'border border-[var(--border-default)]',
                  'hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-emphasis)]',
                  'transition-colors text-left',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {ROLE_LABELS[account.role]}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
