-- Migration 004: Terraform-managed resources
-- Phase 21-2: IaC support for alerts, SLO, dashboards, notification channels

CREATE TABLE IF NOT EXISTS alert_policies (
    policy_id       TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
    target          TEXT NOT NULL,
    condition_type  TEXT NOT NULL CHECK (condition_type IN ('metric','trace','log','composite')),
    condition       TEXT NOT NULL,
    threshold_type  TEXT NOT NULL DEFAULT 'static' CHECK (threshold_type IN ('static','dynamic','forecast')),
    channels        JSONB DEFAULT '[]',
    enabled         BOOLEAN DEFAULT TRUE,
    managed_by      TEXT DEFAULT 'ui' CHECK (managed_by IN ('ui','terraform','api')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slo_definitions (
    slo_id          TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    service         TEXT NOT NULL,
    sli             TEXT NOT NULL,
    target          DOUBLE PRECISION NOT NULL,
    window          TEXT NOT NULL CHECK (window IN ('7d','30d','90d')),
    managed_by      TEXT DEFAULT 'ui' CHECK (managed_by IN ('ui','terraform','api')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dashboards (
    dashboard_id    TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    template        TEXT,
    widgets         JSONB DEFAULT '[]',
    managed_by      TEXT DEFAULT 'ui' CHECK (managed_by IN ('ui','terraform','api')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_channels (
    channel_id      TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('slack','email','pagerduty','webhook','teams')),
    config          JSONB NOT NULL DEFAULT '{}',
    enabled         BOOLEAN DEFAULT TRUE,
    managed_by      TEXT DEFAULT 'ui' CHECK (managed_by IN ('ui','terraform','api')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    key_id          TEXT PRIMARY KEY,
    key_hash        TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'viewer',
    organization_id TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
