// Package sso implements enterprise SSO (SAML/OIDC) for the AITOP platform.
// Supports Okta, Azure AD (Entra ID), and Google Workspace.
//
// Libraries used (all Apache 2.0 / MIT licensed):
//   - github.com/coreos/go-oidc/v3 (Apache 2.0) for OIDC
//   - github.com/crewjam/saml (Apache 2.0) for SAML
package sso

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
)

// Provider represents an SSO provider configuration.
type Provider struct {
	ID             string            `json:"id"`
	OrganizationID string            `json:"organization_id"`
	Name           string            `json:"name"`
	Protocol       string            `json:"protocol"` // "oidc" or "saml"
	Enabled        bool              `json:"enabled"`
	OIDCIssuer     string            `json:"oidc_issuer,omitempty"`
	OIDCClientID   string            `json:"oidc_client_id,omitempty"`
	OIDCScopes     string            `json:"oidc_scopes,omitempty"`
	SAMLMetadataURL string           `json:"saml_idp_metadata_url,omitempty"`
	SAMLEntityID   string            `json:"saml_sp_entity_id,omitempty"`
	SAMLACS        string            `json:"saml_acs_url,omitempty"`
	DefaultRole    auth.Role         `json:"default_role"`
	RoleMapping    map[string]string `json:"role_mapping,omitempty"` // external group → AITOP role
	AutoProvision  bool              `json:"auto_provision"`
	ButtonLabel    string            `json:"buttonLabel,omitempty"`
}

// UserInfo represents the authenticated user from an SSO provider.
type UserInfo struct {
	ExternalID string
	Email      string
	Name       string
	Groups     []string
	AvatarURL  string
}

// Manager orchestrates SSO login flows and identity mapping.
type Manager struct {
	jwtMgr *auth.JWTManager
	logger *slog.Logger
	// In production, providers would be loaded from the database.
	// For MVP, we use in-memory demo providers.
	providers map[string]*Provider
}

// NewManager creates a new SSO manager.
func NewManager(jwtMgr *auth.JWTManager, logger *slog.Logger) *Manager {
	m := &Manager{
		jwtMgr:    jwtMgr,
		logger:    logger,
		providers: make(map[string]*Provider),
	}
	// Load demo SSO providers
	m.loadDemoProviders()
	return m
}

func (m *Manager) loadDemoProviders() {
	m.providers["sso-okta"] = &Provider{
		ID: "sso-okta", OrganizationID: "org-001", Name: "Okta", Protocol: "oidc",
		Enabled: true, OIDCIssuer: "https://dev-123456.okta.com", OIDCClientID: "0oa1234567890",
		OIDCScopes: "openid email profile groups", DefaultRole: auth.RoleViewer,
		AutoProvision: true, ButtonLabel: "Sign in with Okta",
		RoleMapping: map[string]string{"admin-group": "admin", "sre-team": "sre"},
	}
	m.providers["sso-azure"] = &Provider{
		ID: "sso-azure", OrganizationID: "org-001", Name: "Azure AD", Protocol: "oidc",
		Enabled: true, OIDCIssuer: "https://login.microsoftonline.com/tenant-id/v2.0",
		OIDCClientID: "app-client-id", OIDCScopes: "openid email profile",
		DefaultRole: auth.RoleViewer, AutoProvision: true, ButtonLabel: "Sign in with Microsoft",
	}
	m.providers["sso-google"] = &Provider{
		ID: "sso-google", OrganizationID: "org-001", Name: "Google Workspace", Protocol: "oidc",
		Enabled: false, OIDCIssuer: "https://accounts.google.com",
		OIDCClientID: "google-client-id", OIDCScopes: "openid email profile",
		DefaultRole: auth.RoleViewer, AutoProvision: true, ButtonLabel: "Sign in with Google",
	}
}

// ListProviders returns all SSO providers (public: for login page).
func (m *Manager) ListProviders() []*Provider {
	var providers []*Provider
	for _, p := range m.providers {
		if p.Enabled {
			providers = append(providers, p)
		}
	}
	return providers
}

// ListAllProviders returns all SSO providers including disabled (admin view).
func (m *Manager) ListAllProviders() []*Provider {
	var providers []*Provider
	for _, p := range m.providers {
		providers = append(providers, p)
	}
	return providers
}

// GetProvider returns a single SSO provider by ID.
func (m *Manager) GetProvider(id string) (*Provider, error) {
	p, ok := m.providers[id]
	if !ok {
		return nil, fmt.Errorf("SSO provider %s not found", id)
	}
	return p, nil
}

// CreateProvider adds a new SSO provider.
func (m *Manager) CreateProvider(p *Provider) error {
	if p.ID == "" {
		p.ID = fmt.Sprintf("sso-%d", time.Now().UnixMilli())
	}
	m.providers[p.ID] = p
	m.logger.Info("SSO provider created", "id", p.ID, "name", p.Name, "protocol", p.Protocol)
	return nil
}

// UpdateProvider updates an existing SSO provider.
func (m *Manager) UpdateProvider(p *Provider) error {
	if _, ok := m.providers[p.ID]; !ok {
		return fmt.Errorf("SSO provider %s not found", p.ID)
	}
	m.providers[p.ID] = p
	m.logger.Info("SSO provider updated", "id", p.ID)
	return nil
}

// DeleteProvider removes an SSO provider.
func (m *Manager) DeleteProvider(id string) error {
	if _, ok := m.providers[id]; !ok {
		return fmt.Errorf("SSO provider %s not found", id)
	}
	delete(m.providers, id)
	m.logger.Info("SSO provider deleted", "id", id)
	return nil
}

// MapIdentity maps an external SSO identity to AITOP claims.
func (m *Manager) MapIdentity(provider *Provider, userInfo *UserInfo) *auth.Claims {
	role := provider.DefaultRole

	// Apply role mapping based on groups
	for _, group := range userInfo.Groups {
		if mappedRole, ok := provider.RoleMapping[group]; ok {
			candidate := auth.Role(mappedRole)
			if auth.RoleLevel(candidate) > auth.RoleLevel(role) {
				role = candidate
			}
		}
	}

	return &auth.Claims{
		UserID:         fmt.Sprintf("sso-%s-%s", provider.ID, userInfo.ExternalID),
		Email:          userInfo.Email,
		Name:           userInfo.Name,
		Role:           role,
		OrganizationID: provider.OrganizationID,
	}
}

// GenerateState generates a random state string for OIDC/SAML flows.
func GenerateState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
