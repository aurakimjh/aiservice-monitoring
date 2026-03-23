'use client';

import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { getSSOProviders } from '@/lib/demo-data';
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  TestTube,
  Download,
} from 'lucide-react';

interface SSOProvider {
  id: string;
  name: string;
  protocol: string;
  enabled: boolean;
  buttonLabel?: string;
  oidc_issuer?: string;
  oidc_client_id?: string;
  default_role?: string;
  auto_provision?: boolean;
}

export function SSOSettings() {
  const providers = useMemo<SSOProvider[]>(() => {
    const base = getSSOProviders();
    return base.map((p) => ({
      ...p,
      oidc_issuer: p.protocol === 'oidc' ? 'https://idp.example.com' : undefined,
      oidc_client_id: p.protocol === 'oidc' ? 'client-id-****' : undefined,
      default_role: 'viewer',
      auto_provision: true,
    }));
  }, []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editProvider, setEditProvider] = useState<SSOProvider | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">SSO Providers</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Configure enterprise SSO via OIDC or SAML
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-90 transition-opacity"
        >
          <Plus size={12} /> Add Provider
        </button>
      </div>

      {/* Provider list */}
      <div className="space-y-2">
        {providers.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-[var(--accent-primary)]" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{p.name}</span>
                    <Badge status={p.enabled ? 'healthy' : 'warning'}>
                      {p.protocol.toUpperCase()}
                    </Badge>
                    {p.enabled ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-400">
                        <ToggleRight size={12} /> Enabled
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                        <ToggleLeft size={12} /> Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
                    {p.oidc_issuer && <span>Issuer: {p.oidc_issuer}</span>}
                    <span>Default Role: {p.default_role}</span>
                    <span>Auto-provision: {p.auto_provision ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                  title="Test Connection"
                >
                  <TestTube size={14} className="text-[var(--text-muted)]" />
                </button>
                {p.protocol === 'saml' && (
                  <button
                    className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Download SP Metadata"
                  >
                    <Download size={14} className="text-[var(--text-muted)]" />
                  </button>
                )}
                <button
                  onClick={() => setEditProvider(p)}
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} className="text-[var(--text-muted)]" />
                </button>
                <button
                  className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editProvider) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg w-[500px] max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-[var(--border-default)]">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {editProvider ? 'Edit SSO Provider' : 'Add SSO Provider'}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Protocol</label>
                <select className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]">
                  <option value="oidc">OIDC (OpenID Connect)</option>
                  <option value="saml">SAML 2.0</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Provider Name</label>
                <input
                  type="text"
                  defaultValue={editProvider?.name || ''}
                  placeholder="e.g., Okta, Azure AD"
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Issuer URL</label>
                <input
                  type="text"
                  defaultValue={editProvider?.oidc_issuer || ''}
                  placeholder="https://dev-123456.okta.com"
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Client ID</label>
                <input
                  type="text"
                  defaultValue={editProvider?.oidc_client_id || ''}
                  placeholder="0oa1234567890"
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Client Secret</label>
                <input
                  type="password"
                  placeholder="****"
                  className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Default Role</label>
                <select className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-2 py-1.5 text-[var(--text-primary)]">
                  <option value="viewer">Viewer</option>
                  <option value="ai_engineer">AI Engineer</option>
                  <option value="sre">SRE</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span className="text-xs text-[var(--text-primary)]">Auto-provision users on first SSO login</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--border-default)]">
              <button
                onClick={() => { setShowAddModal(false); setEditProvider(null); }}
                className="px-3 py-1 text-xs border border-[var(--border-default)] rounded hover:bg-[var(--bg-secondary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowAddModal(false); setEditProvider(null); }}
                className="px-3 py-1 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-90 transition-opacity"
              >
                {editProvider ? 'Save Changes' : 'Create Provider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Mapping Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs">Role Mapping</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 text-xs text-[var(--text-muted)]">
          <p className="mb-2">Map IdP groups to AITOP roles. Users matching multiple groups get the highest privilege.</p>
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-[var(--border-muted)]">
                <th className="pb-1 font-medium">IdP Group</th>
                <th className="pb-1 font-medium">AITOP Role</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border-muted)]">
                <td className="py-1 font-mono">admin-group</td>
                <td className="py-1"><Badge status="critical">Admin</Badge></td>
              </tr>
              <tr className="border-b border-[var(--border-muted)]">
                <td className="py-1 font-mono">sre-team</td>
                <td className="py-1"><Badge status="warning">SRE</Badge></td>
              </tr>
              <tr>
                <td className="py-1 font-mono text-[var(--text-muted)]">(default)</td>
                <td className="py-1"><Badge status="healthy">Viewer</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
