package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// SSOProvider represents a row in the sso_providers table.
type SSOProvider struct {
	ProviderID     string            `json:"provider_id"`
	OrganizationID string            `json:"organization_id"`
	Name           string            `json:"name"`
	Protocol       string            `json:"protocol"`
	Enabled        bool              `json:"enabled"`
	OIDCIssuer     string            `json:"oidc_issuer,omitempty"`
	OIDCClientID   string            `json:"oidc_client_id,omitempty"`
	OIDCScopes     string            `json:"oidc_scopes,omitempty"`
	SAMLMetadataURL string           `json:"saml_idp_metadata_url,omitempty"`
	SAMLEntityID   string            `json:"saml_sp_entity_id,omitempty"`
	SAMLACS        string            `json:"saml_acs_url,omitempty"`
	DefaultRole    string            `json:"default_role"`
	RoleMapping    map[string]string `json:"role_mapping,omitempty"`
	AutoProvision  bool              `json:"auto_provision"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

// InsertSSOProvider stores a new SSO provider configuration.
func (db *DB) InsertSSOProvider(ctx context.Context, p *SSOProvider) error {
	if !db.IsAvailable() {
		return nil
	}
	roleMappingJSON, _ := json.Marshal(p.RoleMapping)
	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO sso_providers (provider_id, organization_id, name, protocol, enabled,
		  oidc_issuer, oidc_client_id, oidc_scopes,
		  saml_idp_metadata_url, saml_sp_entity_id, saml_acs_url,
		  default_role, role_mapping, auto_provision)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	`, p.ProviderID, p.OrganizationID, p.Name, p.Protocol, p.Enabled,
		nullStr(p.OIDCIssuer), nullStr(p.OIDCClientID), nullStr(p.OIDCScopes),
		nullStr(p.SAMLMetadataURL), nullStr(p.SAMLEntityID), nullStr(p.SAMLACS),
		p.DefaultRole, string(roleMappingJSON), p.AutoProvision)
	return err
}

// ListSSOProviders returns all SSO providers for an organization.
func (db *DB) ListSSOProviders(ctx context.Context, orgID string) ([]SSOProvider, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	rows, err := db.conn.QueryContext(ctx, `
		SELECT provider_id, organization_id, name, protocol, enabled,
		  COALESCE(oidc_issuer,''), COALESCE(oidc_client_id,''), COALESCE(oidc_scopes,''),
		  COALESCE(saml_idp_metadata_url,''), COALESCE(saml_sp_entity_id,''), COALESCE(saml_acs_url,''),
		  default_role, COALESCE(role_mapping,'{}'), auto_provision, created_at, updated_at
		FROM sso_providers WHERE organization_id = $1 ORDER BY created_at
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var providers []SSOProvider
	for rows.Next() {
		var p SSOProvider
		var rmStr string
		if err := rows.Scan(&p.ProviderID, &p.OrganizationID, &p.Name, &p.Protocol, &p.Enabled,
			&p.OIDCIssuer, &p.OIDCClientID, &p.OIDCScopes,
			&p.SAMLMetadataURL, &p.SAMLEntityID, &p.SAMLACS,
			&p.DefaultRole, &rmStr, &p.AutoProvision, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(rmStr), &p.RoleMapping)
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

// GetSSOProvider returns a single SSO provider by ID.
func (db *DB) GetSSOProvider(ctx context.Context, id string) (*SSOProvider, error) {
	if !db.IsAvailable() {
		return nil, nil
	}
	var p SSOProvider
	var rmStr string
	err := db.conn.QueryRowContext(ctx, `
		SELECT provider_id, organization_id, name, protocol, enabled,
		  COALESCE(oidc_issuer,''), COALESCE(oidc_client_id,''), COALESCE(oidc_scopes,''),
		  COALESCE(saml_idp_metadata_url,''), COALESCE(saml_sp_entity_id,''), COALESCE(saml_acs_url,''),
		  default_role, COALESCE(role_mapping,'{}'), auto_provision, created_at, updated_at
		FROM sso_providers WHERE provider_id = $1
	`, id).Scan(&p.ProviderID, &p.OrganizationID, &p.Name, &p.Protocol, &p.Enabled,
		&p.OIDCIssuer, &p.OIDCClientID, &p.OIDCScopes,
		&p.SAMLMetadataURL, &p.SAMLEntityID, &p.SAMLACS,
		&p.DefaultRole, &rmStr, &p.AutoProvision, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	_ = json.Unmarshal([]byte(rmStr), &p.RoleMapping)
	return &p, err
}

// DeleteSSOProvider removes an SSO provider and its identities.
func (db *DB) DeleteSSOProvider(ctx context.Context, id string) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `DELETE FROM sso_providers WHERE provider_id = $1`, id)
	return err
}

// SSOIdentity represents a mapping from external SSO identity to AITOP user.
type SSOIdentity struct {
	ID            int64     `json:"id"`
	ProviderID    string    `json:"provider_id"`
	ExternalID    string    `json:"external_id"`
	ExternalEmail string    `json:"external_email"`
	UserID        string    `json:"user_id"`
	LastLoginAt   time.Time `json:"last_login_at,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// UpsertSSOIdentity creates or updates an SSO identity mapping.
func (db *DB) UpsertSSOIdentity(ctx context.Context, i *SSOIdentity) error {
	if !db.IsAvailable() {
		return nil
	}
	_, err := db.conn.ExecContext(ctx, `
		INSERT INTO sso_identities (provider_id, external_id, external_email, user_id, last_login_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (provider_id, external_id) DO UPDATE SET
		  external_email = EXCLUDED.external_email,
		  last_login_at = NOW()
	`, i.ProviderID, i.ExternalID, i.ExternalEmail, i.UserID)
	return err
}
