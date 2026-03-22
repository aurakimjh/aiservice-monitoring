-- AITOP Collection Server — PostgreSQL 초기 스키마
-- 실행: psql -U aitop -d aitop_collection -f 001_initial_schema.sql
-- 버전: 001 (2026-03-22)

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- 1. agents — 에이전트 등록 정보
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agents (
    agent_id        TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL,
    os_type         TEXT NOT NULL DEFAULT 'linux',
    os_version      TEXT NOT NULL DEFAULT '',
    agent_version   TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'registered'
                    CHECK (status IN (
                        'registered','approved','healthy','degraded',
                        'offline','upgrade-available','upgrade-in-progress',
                        'quarantined','retired'
                    )),
    project_id      TEXT,
    tags            JSONB DEFAULT '[]',
    cpu_percent     DOUBLE PRECISION DEFAULT 0,
    memory_mb       DOUBLE PRECISION DEFAULT 0,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_agents_hostname ON agents(hostname);

-- ═══════════════════════════════════════════════════════════
-- 2. agent_plugins — 에이전트별 플러그인 상태
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_plugins (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    plugin_id       TEXT NOT NULL,
    version         TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'inactive'
                    CHECK (status IN ('active','inactive','error')),
    auto_detected   BOOLEAN DEFAULT FALSE,
    items_covered   JSONB DEFAULT '[]',
    last_collect    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, plugin_id)
);

CREATE INDEX idx_agent_plugins_agent ON agent_plugins(agent_id);

-- ═══════════════════════════════════════════════════════════
-- 3. collection_jobs — 수집 작업 이력
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collection_jobs (
    job_id          TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    job_type        TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (job_type IN ('scheduled','manual','diagnostic','emergency')),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','cancelled')),
    collectors      JSONB DEFAULT '[]',          -- 실행할 collector ID 목록
    progress        INTEGER DEFAULT 0,           -- 0~100
    result_count    INTEGER DEFAULT 0,
    error_count     INTEGER DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_agent ON collection_jobs(agent_id);
CREATE INDEX idx_jobs_status ON collection_jobs(status);
CREATE INDEX idx_jobs_created ON collection_jobs(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. collect_results — 수집 결과 메타데이터 (Evidence는 S3)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collect_results (
    result_id       TEXT PRIMARY KEY,
    job_id          TEXT REFERENCES collection_jobs(job_id) ON DELETE SET NULL,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    collector_id    TEXT NOT NULL,
    schema_name     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success','partial','failed','skipped','quarantined')),
    item_count      INTEGER DEFAULT 0,
    error_count     INTEGER DEFAULT 0,
    duration_ms     INTEGER DEFAULT 0,
    s3_key          TEXT,                        -- S3 Evidence 경로
    metadata        JSONB DEFAULT '{}',
    collected_at    TIMESTAMPTZ NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_agent ON collect_results(agent_id);
CREATE INDEX idx_results_collector ON collect_results(collector_id);
CREATE INDEX idx_results_collected ON collect_results(collected_at DESC);
CREATE INDEX idx_results_job ON collect_results(job_id);

-- ═══════════════════════════════════════════════════════════
-- 5. diagnostic_results — 진단 결과
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diagnostic_results (
    diagnostic_id   TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    job_id          TEXT REFERENCES collection_jobs(job_id) ON DELETE SET NULL,
    scope           TEXT NOT NULL DEFAULT 'full'
                    CHECK (scope IN ('full','it-only','ai-only')),
    total_items     INTEGER DEFAULT 0,
    passed          INTEGER DEFAULT 0,
    warned          INTEGER DEFAULT 0,
    failed          INTEGER DEFAULT 0,
    items           JSONB DEFAULT '[]',          -- 진단 항목 상세 배열
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diag_agent ON diagnostic_results(agent_id);
CREATE INDEX idx_diag_created ON diagnostic_results(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 6. terminal_sessions — 원격 CLI 세션 기록 (감사 로그)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS terminal_sessions (
    session_id      TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    user_role       TEXT NOT NULL DEFAULT 'sre',
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','closed','timeout','error')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    duration_sec    INTEGER DEFAULT 0,
    command_count   INTEGER DEFAULT 0,
    s3_log_key      TEXT                         -- S3 세션 기록 파일 경로
);

CREATE INDEX idx_terminal_agent ON terminal_sessions(agent_id);
CREATE INDEX idx_terminal_user ON terminal_sessions(user_id);
CREATE INDEX idx_terminal_started ON terminal_sessions(started_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 7. fleet_groups — 에이전트 그룹
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fleet_groups (
    group_id        TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT DEFAULT '',
    tags            JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet_group_members (
    group_id        TEXT NOT NULL REFERENCES fleet_groups(group_id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, agent_id)
);

-- ═══════════════════════════════════════════════════════════
-- 8. collection_schedules — 수집 스케줄
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collection_schedules (
    schedule_id     TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    cron_expr       TEXT NOT NULL,
    target_type     TEXT NOT NULL DEFAULT 'group'
                    CHECK (target_type IN ('group','agent','all')),
    target_id       TEXT,                        -- group_id 또는 agent_id
    collectors      JSONB DEFAULT '[]',          -- 실행할 collector 목록
    enabled         BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- 9. schema_migrations — 마이그레이션 이력 추적
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
    version         INTEGER PRIMARY KEY,
    description     TEXT NOT NULL,
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES (1, 'Initial schema — agents, plugins, jobs, results, diagnostics, terminal, groups, schedules')
ON CONFLICT (version) DO NOTHING;

COMMIT;
