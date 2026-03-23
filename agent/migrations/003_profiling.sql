-- Migration 003: Continuous Profiling schema
-- Phase 21-1: CPU/Memory profiling with trace linkage

CREATE TABLE IF NOT EXISTS profiling_profiles (
    profile_id      TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    service_name    TEXT NOT NULL,
    language        TEXT NOT NULL CHECK (language IN ('go','python','java','dotnet','nodejs')),
    profile_type    TEXT NOT NULL CHECK (profile_type IN ('cpu','memory','goroutine','thread','lock','alloc')),
    format          TEXT NOT NULL DEFAULT 'pprof' CHECK (format IN ('pprof','jfr','collapsed')),
    duration_sec    INTEGER NOT NULL DEFAULT 30,
    sample_count    INTEGER DEFAULT 0,
    s3_key          TEXT NOT NULL,
    size_bytes      BIGINT DEFAULT 0,
    labels          JSONB DEFAULT '{}',
    trace_id        TEXT,
    span_id         TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_agent     ON profiling_profiles(agent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_service   ON profiling_profiles(service_name);
CREATE INDEX IF NOT EXISTS idx_profiles_type      ON profiling_profiles(profile_type);
CREATE INDEX IF NOT EXISTS idx_profiles_trace     ON profiling_profiles(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_started   ON profiling_profiles(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_language  ON profiling_profiles(language);
