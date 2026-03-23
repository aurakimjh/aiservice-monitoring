-- Migration 005: SSO (SAML/OIDC) schema
-- Phase 21-3: Enterprise SSO integration

CREATE TABLE IF NOT EXISTS sso_providers (
    provider_id     TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name            TEXT NOT NULL,
    protocol        TEXT NOT NULL CHECK (protocol IN ('oidc','saml')),
    enabled         BOOLEAN DEFAULT TRUE,
    oidc_issuer     TEXT,
    oidc_client_id  TEXT,
    oidc_client_secret_encrypted TEXT,
    oidc_scopes     TEXT DEFAULT 'openid email profile',
    saml_idp_metadata_url TEXT,
    saml_idp_metadata_xml TEXT,
    saml_sp_entity_id     TEXT,
    saml_acs_url          TEXT,
    saml_certificate      TEXT,
    saml_private_key_encrypted TEXT,
    default_role    TEXT NOT NULL DEFAULT 'viewer' CHECK (default_role IN ('admin','sre','ai_engineer','viewer')),
    role_mapping    JSONB DEFAULT '{}',
    auto_provision  BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_org ON sso_providers(organization_id);

CREATE TABLE IF NOT EXISTS sso_identities (
    id              BIGSERIAL PRIMARY KEY,
    provider_id     TEXT NOT NULL REFERENCES sso_providers(provider_id) ON DELETE CASCADE,
    external_id     TEXT NOT NULL,
    external_email  TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_sso_identity_user ON sso_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_identity_email ON sso_identities(external_email);

CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    role            TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','sre','ai_engineer','viewer')),
    organization_id TEXT NOT NULL,
    auth_method     TEXT NOT NULL DEFAULT 'local' CHECK (auth_method IN ('local','oidc','saml')),
    password_hash   TEXT,
    avatar_url      TEXT,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
