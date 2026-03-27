package main

// store.go — SQLite 영속화: Project CRUD + Agent 상태 저장
//
// Collection Server 재시작해도 프로젝트, Agent 승인 상태가 유지됩니다.
// 데이터 경로: AITOP_DB_PATH 환경변수 또는 기본 ./aitop-server.db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	_ "modernc.org/sqlite"
)

// Store wraps SQLite for project + agent persistence.
type Store struct {
	db     *sql.DB
	logger *slog.Logger
}

// Project represents a project row.
type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Environment string `json:"environment"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// OpenStore opens (or creates) the SQLite database.
func OpenStore(logger *slog.Logger) (*Store, error) {
	path := os.Getenv("AITOP_DB_PATH")
	if path == "" {
		path = "aitop-server.db"
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// WAL mode for concurrency
	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA busy_timeout=5000")

	s := &Store{db: db, logger: logger}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			description TEXT DEFAULT '',
			environment TEXT DEFAULT 'production',
			created_at  TEXT DEFAULT (datetime('now')),
			updated_at  TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS agents (
			id            TEXT PRIMARY KEY,
			hostname      TEXT NOT NULL,
			os_type       TEXT DEFAULT '',
			os_version    TEXT DEFAULT '',
			agent_version TEXT DEFAULT '',
			project_id    TEXT DEFAULT '',
			approved      INTEGER DEFAULT 0,
			status        TEXT DEFAULT 'registered',
			cpu_percent   REAL DEFAULT 0,
			memory_mb     REAL DEFAULT 0,
			os_metrics    TEXT DEFAULT '{}',
			registered_at TEXT DEFAULT (datetime('now')),
			last_heartbeat TEXT DEFAULT (datetime('now')),
			FOREIGN KEY (project_id) REFERENCES projects(id)
		);

		CREATE TABLE IF NOT EXISTS services (
			id             TEXT PRIMARY KEY,
			name           TEXT NOT NULL UNIQUE,
			project_id     TEXT DEFAULT '',
			service_group_id TEXT DEFAULT '',
			type           TEXT DEFAULT 'api',
			framework      TEXT DEFAULT '',
			language       TEXT DEFAULT '',
			owner          TEXT DEFAULT '',
			discovered_via TEXT DEFAULT 'manual',
			host_ids       TEXT DEFAULT '[]',
			created_at     TEXT DEFAULT (datetime('now')),
			updated_at     TEXT DEFAULT (datetime('now')),
			FOREIGN KEY (project_id) REFERENCES projects(id)
		);

		CREATE TABLE IF NOT EXISTS service_groups (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL,
			project_id   TEXT DEFAULT '',
			type         TEXT DEFAULT 'rag',
			description  TEXT DEFAULT '',
			service_ids  TEXT DEFAULT '[]',
			created_at   TEXT DEFAULT (datetime('now')),
			updated_at   TEXT DEFAULT (datetime('now')),
			FOREIGN KEY (project_id) REFERENCES projects(id)
		);

		CREATE TABLE IF NOT EXISTS evals (
			id         TEXT PRIMARY KEY,
			trace_id   TEXT DEFAULT '',
			span_id    TEXT DEFAULT '',
			service    TEXT DEFAULT '',
			model      TEXT DEFAULT '',
			scores     TEXT DEFAULT '{}',
			feedback   TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS prompt_versions (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL,
			version    TEXT DEFAULT '1.0',
			template   TEXT DEFAULT '',
			model      TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS security_events (
			id         TEXT PRIMARY KEY,
			type       TEXT NOT NULL,
			severity   TEXT DEFAULT 'medium',
			trace_id   TEXT DEFAULT '',
			service    TEXT DEFAULT '',
			detail     TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS model_prices (
			id                TEXT PRIMARY KEY,
			provider          TEXT NOT NULL,
			model             TEXT NOT NULL,
			input_per_million REAL DEFAULT 0,
			output_per_million REAL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS token_usage (
			trace_id      TEXT,
			span_id       TEXT,
			service       TEXT DEFAULT '',
			provider      TEXT DEFAULT '',
			model         TEXT DEFAULT '',
			input_tokens  INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			cost_usd      REAL DEFAULT 0,
			latency_ms    REAL DEFAULT 0,
			timestamp     TEXT DEFAULT (datetime('now')),
			PRIMARY KEY (trace_id, span_id)
		);

		CREATE TABLE IF NOT EXISTS instances (
			id          TEXT PRIMARY KEY,
			service_id  TEXT NOT NULL,
			host_id     TEXT DEFAULT '',
			hostname    TEXT DEFAULT '',
			endpoint    TEXT DEFAULT '',
			pid         INTEGER DEFAULT 0,
			status      TEXT DEFAULT 'running',
			started_at  TEXT DEFAULT '',
			updated_at  TEXT DEFAULT (datetime('now')),
			cpu_pct     REAL DEFAULT 0,
			mem_mb      REAL DEFAULT 0,
			FOREIGN KEY (service_id) REFERENCES services(id)
		);
	`)
	if err != nil {
		return err
	}
	// Seed default model prices
	defaults := []ModelPrice{
		{Provider: "openai", Model: "gpt-4o", InputPerMillion: 2.5, OutputPerMillion: 10.0},
		{Provider: "openai", Model: "gpt-4o-mini", InputPerMillion: 0.15, OutputPerMillion: 0.6},
		{Provider: "anthropic", Model: "claude-sonnet-4", InputPerMillion: 3.0, OutputPerMillion: 15.0},
		{Provider: "anthropic", Model: "claude-haiku-4", InputPerMillion: 0.25, OutputPerMillion: 1.25},
		{Provider: "ollama", Model: "llama3.2:3b", InputPerMillion: 0, OutputPerMillion: 0},
		{Provider: "local", Model: "local", InputPerMillion: 0, OutputPerMillion: 0},
	}
	for _, d := range defaults {
		s.UpsertModelPrice(&d)
	}
	return nil
}

// ── Service ──

// ServiceRecord represents a service row.
type ServiceRecord struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	ProjectID      string   `json:"project_id"`
	ServiceGroupID string   `json:"service_group_id"`
	Type           string   `json:"type"`
	Framework      string   `json:"framework"`
	Language       string   `json:"language"`
	Owner          string   `json:"owner"`
	DiscoveredVia  string   `json:"discovered_via"` // "jaeger", "agent", "manual"
	HostIDs        []string `json:"host_ids"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

// UpsertService inserts or updates a service (auto-discovery or manual).
func (s *Store) UpsertService(svc *ServiceRecord) error {
	if svc.ID == "" {
		svc.ID = fmt.Sprintf("svc-%d", time.Now().UnixMilli())
	}
	hostJSON, _ := json.Marshal(svc.HostIDs)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO services (id, name, project_id, service_group_id, type, framework, language, owner, discovered_via, host_ids, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			project_id=CASE WHEN excluded.project_id!='' THEN excluded.project_id ELSE services.project_id END,
			type=CASE WHEN excluded.type!='' AND excluded.type!='api' THEN excluded.type ELSE services.type END,
			framework=CASE WHEN excluded.framework!='' THEN excluded.framework ELSE services.framework END,
			language=CASE WHEN excluded.language!='' THEN excluded.language ELSE services.language END,
			discovered_via=excluded.discovered_via,
			host_ids=excluded.host_ids,
			updated_at=excluded.updated_at
	`, svc.ID, svc.Name, svc.ProjectID, svc.ServiceGroupID, svc.Type, svc.Framework,
		svc.Language, svc.Owner, svc.DiscoveredVia, string(hostJSON), now, now)
	return err
}

func (s *Store) ListServices(projectID string) ([]ServiceRecord, error) {
	query := `SELECT id, name, project_id, service_group_id, type, framework, language, owner, discovered_via, host_ids, created_at, updated_at FROM services`
	args := []interface{}{}
	if projectID != "" {
		query += ` WHERE project_id = ?`
		args = append(args, projectID)
	}
	query += ` ORDER BY name`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var services []ServiceRecord
	for rows.Next() {
		var sr ServiceRecord
		var hostJSON string
		rows.Scan(&sr.ID, &sr.Name, &sr.ProjectID, &sr.ServiceGroupID, &sr.Type, &sr.Framework,
			&sr.Language, &sr.Owner, &sr.DiscoveredVia, &hostJSON, &sr.CreatedAt, &sr.UpdatedAt)
		json.Unmarshal([]byte(hostJSON), &sr.HostIDs)
		services = append(services, sr)
	}
	return services, nil
}

func (s *Store) GetService(id string) (*ServiceRecord, error) {
	var sr ServiceRecord
	var hostJSON string
	err := s.db.QueryRow(`SELECT id, name, project_id, service_group_id, type, framework, language, owner, discovered_via, host_ids, created_at, updated_at FROM services WHERE id = ? OR name = ?`, id, id).
		Scan(&sr.ID, &sr.Name, &sr.ProjectID, &sr.ServiceGroupID, &sr.Type, &sr.Framework,
			&sr.Language, &sr.Owner, &sr.DiscoveredVia, &hostJSON, &sr.CreatedAt, &sr.UpdatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal([]byte(hostJSON), &sr.HostIDs)
	return &sr, nil
}

func (s *Store) UpdateService(id string, updates map[string]string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	for k, v := range updates {
		s.db.Exec(fmt.Sprintf(`UPDATE services SET %s=?, updated_at=? WHERE id=?`, k), v, now, id)
	}
	return nil
}

func (s *Store) DeleteService(id string) error {
	s.db.Exec(`DELETE FROM instances WHERE service_id=?`, id)
	_, err := s.db.Exec(`DELETE FROM services WHERE id=?`, id)
	return err
}

// ── Instance ──

// InstanceRecord represents a service instance (process/pod on a host).
type InstanceRecord struct {
	ID        string  `json:"id"`
	ServiceID string  `json:"service_id"`
	HostID    string  `json:"host_id"`
	Hostname  string  `json:"hostname"`
	Endpoint  string  `json:"endpoint"` // host:port
	PID       int     `json:"pid,omitempty"`
	Status    string  `json:"status"` // running / stopped / error
	StartedAt string  `json:"started_at,omitempty"`
	UpdatedAt string  `json:"updated_at"`
	CPUPct    float64 `json:"cpu_pct"`
	MemMB     float64 `json:"mem_mb"`
}

func (s *Store) UpsertInstance(inst *InstanceRecord) error {
	if inst.ID == "" {
		inst.ID = fmt.Sprintf("inst-%s-%s", inst.ServiceID, inst.HostID)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO instances (id, service_id, host_id, hostname, endpoint, pid, status, started_at, updated_at, cpu_pct, mem_mb)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			endpoint=excluded.endpoint, pid=excluded.pid, status=excluded.status,
			updated_at=excluded.updated_at, cpu_pct=excluded.cpu_pct, mem_mb=excluded.mem_mb
	`, inst.ID, inst.ServiceID, inst.HostID, inst.Hostname, inst.Endpoint,
		inst.PID, inst.Status, inst.StartedAt, now, inst.CPUPct, inst.MemMB)
	return err
}

func (s *Store) ListInstances(serviceID string) ([]InstanceRecord, error) {
	query := `SELECT id, service_id, host_id, hostname, endpoint, pid, status, started_at, updated_at, cpu_pct, mem_mb FROM instances`
	args := []interface{}{}
	if serviceID != "" {
		query += ` WHERE service_id = ?`
		args = append(args, serviceID)
	}
	query += ` ORDER BY hostname, endpoint`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var instances []InstanceRecord
	for rows.Next() {
		var inst InstanceRecord
		rows.Scan(&inst.ID, &inst.ServiceID, &inst.HostID, &inst.Hostname, &inst.Endpoint,
			&inst.PID, &inst.Status, &inst.StartedAt, &inst.UpdatedAt, &inst.CPUPct, &inst.MemMB)
		instances = append(instances, inst)
	}
	return instances, nil
}

func (s *Store) CountInstances(serviceID string) int {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM instances WHERE service_id=? AND status='running'`, serviceID).Scan(&count)
	return count
}

// ── Service Group (AI Pipeline) ──

// ServiceGroupRecord represents a group of services forming a pipeline.
type ServiceGroupRecord struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	ProjectID   string   `json:"project_id"`
	Type        string   `json:"type"` // rag, agent, training, inference
	Description string   `json:"description"`
	ServiceIDs  []string `json:"service_ids"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

func (s *Store) CreateServiceGroup(sg *ServiceGroupRecord) error {
	if sg.ID == "" {
		sg.ID = fmt.Sprintf("sg-%d", time.Now().UnixMilli())
	}
	svcJSON, _ := json.Marshal(sg.ServiceIDs)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO service_groups (id, name, project_id, type, description, service_ids, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, sg.ID, sg.Name, sg.ProjectID, sg.Type, sg.Description, string(svcJSON), now, now)
	return err
}

func (s *Store) ListServiceGroups(projectID string) ([]ServiceGroupRecord, error) {
	query := `SELECT id, name, project_id, type, description, service_ids, created_at, updated_at FROM service_groups`
	args := []interface{}{}
	if projectID != "" {
		query += ` WHERE project_id = ?`
		args = append(args, projectID)
	}
	query += ` ORDER BY name`
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var groups []ServiceGroupRecord
	for rows.Next() {
		var sg ServiceGroupRecord
		var svcJSON string
		rows.Scan(&sg.ID, &sg.Name, &sg.ProjectID, &sg.Type, &sg.Description, &svcJSON, &sg.CreatedAt, &sg.UpdatedAt)
		json.Unmarshal([]byte(svcJSON), &sg.ServiceIDs)
		groups = append(groups, sg)
	}
	return groups, nil
}

func (s *Store) GetServiceGroup(id string) (*ServiceGroupRecord, error) {
	var sg ServiceGroupRecord
	var svcJSON string
	err := s.db.QueryRow(`SELECT id, name, project_id, type, description, service_ids, created_at, updated_at FROM service_groups WHERE id = ?`, id).
		Scan(&sg.ID, &sg.Name, &sg.ProjectID, &sg.Type, &sg.Description, &svcJSON, &sg.CreatedAt, &sg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal([]byte(svcJSON), &sg.ServiceIDs)
	return &sg, nil
}

func (s *Store) UpdateServiceGroup(id string, name, description, sgType string, serviceIDs []string) error {
	svcJSON, _ := json.Marshal(serviceIDs)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE service_groups SET name=?, description=?, type=?, service_ids=?, updated_at=? WHERE id=?`,
		name, description, sgType, string(svcJSON), now, id)
	return err
}

func (s *Store) DeleteServiceGroup(id string) error {
	_, err := s.db.Exec(`DELETE FROM service_groups WHERE id=?`, id)
	return err
}

// ── Model Pricing ──

// ModelPrice represents per-model token pricing.
type ModelPrice struct {
	ID              string  `json:"id"`
	Provider        string  `json:"provider"`         // openai, anthropic, ollama, local
	Model           string  `json:"model"`             // gpt-4o, claude-sonnet-4, llama3.2:3b
	InputPerMillion float64 `json:"input_per_million"` // $/1M input tokens
	OutputPerMillion float64 `json:"output_per_million"` // $/1M output tokens
}

func (s *Store) UpsertModelPrice(mp *ModelPrice) error {
	if mp.ID == "" {
		mp.ID = fmt.Sprintf("mp-%s-%s", mp.Provider, mp.Model)
	}
	_, err := s.db.Exec(`
		INSERT INTO model_prices (id, provider, model, input_per_million, output_per_million)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET input_per_million=excluded.input_per_million, output_per_million=excluded.output_per_million
	`, mp.ID, mp.Provider, mp.Model, mp.InputPerMillion, mp.OutputPerMillion)
	return err
}

func (s *Store) ListModelPrices() ([]ModelPrice, error) {
	rows, err := s.db.Query(`SELECT id, provider, model, input_per_million, output_per_million FROM model_prices ORDER BY provider, model`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var prices []ModelPrice
	for rows.Next() {
		var mp ModelPrice
		rows.Scan(&mp.ID, &mp.Provider, &mp.Model, &mp.InputPerMillion, &mp.OutputPerMillion)
		prices = append(prices, mp)
	}
	return prices, nil
}

func (s *Store) GetModelPrice(provider, model string) *ModelPrice {
	var mp ModelPrice
	err := s.db.QueryRow(`SELECT id, provider, model, input_per_million, output_per_million FROM model_prices WHERE provider=? AND model=?`, provider, model).
		Scan(&mp.ID, &mp.Provider, &mp.Model, &mp.InputPerMillion, &mp.OutputPerMillion)
	if err != nil {
		return nil
	}
	return &mp
}

// CalcCost calculates cost from tokens + model price.
func (s *Store) CalcCost(provider, model string, inputTokens, outputTokens int) float64 {
	mp := s.GetModelPrice(provider, model)
	if mp == nil {
		return 0
	}
	return (float64(inputTokens) * mp.InputPerMillion / 1_000_000) + (float64(outputTokens) * mp.OutputPerMillion / 1_000_000)
}

// ── Token Usage Log ──

// TokenUsageRecord tracks per-request token usage for aggregation.
type TokenUsageRecord struct {
	TraceID      string  `json:"trace_id"`
	SpanID       string  `json:"span_id"`
	Service      string  `json:"service"`
	Provider     string  `json:"provider"`
	Model        string  `json:"model"`
	InputTokens  int     `json:"input_tokens"`
	OutputTokens int     `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	LatencyMS    float64 `json:"latency_ms"`
	Timestamp    string  `json:"timestamp"`
}

func (s *Store) InsertTokenUsage(rec *TokenUsageRecord) error {
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO token_usage (trace_id, span_id, service, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, timestamp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, rec.TraceID, rec.SpanID, rec.Service, rec.Provider, rec.Model,
		rec.InputTokens, rec.OutputTokens, rec.CostUSD, rec.LatencyMS, rec.Timestamp)
	return err
}

// TokenUsageSummary returns aggregated token usage.
type TokenUsageSummary struct {
	Model        string  `json:"model"`
	Provider     string  `json:"provider"`
	TotalCalls   int     `json:"total_calls"`
	TotalInput   int     `json:"total_input_tokens"`
	TotalOutput  int     `json:"total_output_tokens"`
	TotalCost    float64 `json:"total_cost_usd"`
	AvgLatency   float64 `json:"avg_latency_ms"`
}

// ── Eval (Quality Evaluation) ──

type EvalRecord struct {
	ID         string             `json:"id"`
	TraceID    string             `json:"trace_id"`
	SpanID     string             `json:"span_id"`
	Service    string             `json:"service"`
	Model      string             `json:"model"`
	Scores     map[string]float64 `json:"scores"` // relevance, faithfulness, toxicity, hallucination
	Feedback   string             `json:"feedback"` // thumbs_up, thumbs_down, ""
	CreatedAt  string             `json:"created_at"`
}

func (s *Store) InsertEval(rec *EvalRecord) error {
	if rec.ID == "" {
		rec.ID = fmt.Sprintf("eval-%d", time.Now().UnixMilli())
	}
	scoresJSON, _ := json.Marshal(rec.Scores)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO evals (id, trace_id, span_id, service, model, scores, feedback, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, rec.ID, rec.TraceID, rec.SpanID, rec.Service, rec.Model, string(scoresJSON), rec.Feedback, now)
	return err
}

func (s *Store) ListEvals(limit int) ([]EvalRecord, error) {
	if limit <= 0 { limit = 50 }
	rows, err := s.db.Query(`SELECT id, trace_id, span_id, service, model, scores, feedback, created_at FROM evals ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil { return nil, err }
	defer rows.Close()
	var evals []EvalRecord
	for rows.Next() {
		var e EvalRecord
		var scoresJSON string
		rows.Scan(&e.ID, &e.TraceID, &e.SpanID, &e.Service, &e.Model, &scoresJSON, &e.Feedback, &e.CreatedAt)
		json.Unmarshal([]byte(scoresJSON), &e.Scores)
		evals = append(evals, e)
	}
	return evals, nil
}

type EvalSummary struct {
	Metric   string  `json:"metric"`
	AvgScore float64 `json:"avg_score"`
	Count    int     `json:"count"`
}

func (s *Store) GetEvalSummary() ([]EvalSummary, error) {
	evals, err := s.ListEvals(1000)
	if err != nil { return nil, err }
	totals := map[string]struct{ sum float64; count int }{}
	for _, e := range evals {
		for k, v := range e.Scores {
			t := totals[k]
			t.sum += v; t.count++
			totals[k] = t
		}
	}
	var summaries []EvalSummary
	for k, t := range totals {
		summaries = append(summaries, EvalSummary{Metric: k, AvgScore: t.sum / float64(t.count), Count: t.count})
	}
	return summaries, nil
}

// ── Prompt Version ──

type PromptVersion struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Version   string `json:"version"`
	Template  string `json:"template"`
	Model     string `json:"model"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) UpsertPromptVersion(pv *PromptVersion) error {
	if pv.ID == "" { pv.ID = fmt.Sprintf("pv-%d", time.Now().UnixMilli()) }
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT OR REPLACE INTO prompt_versions (id, name, version, template, model, created_at) VALUES (?,?,?,?,?,?)`,
		pv.ID, pv.Name, pv.Version, pv.Template, pv.Model, now)
	return err
}

func (s *Store) ListPromptVersions() ([]PromptVersion, error) {
	rows, err := s.db.Query(`SELECT id, name, version, template, model, created_at FROM prompt_versions ORDER BY name, created_at DESC`)
	if err != nil { return nil, err }
	defer rows.Close()
	var pvs []PromptVersion
	for rows.Next() {
		var pv PromptVersion
		rows.Scan(&pv.ID, &pv.Name, &pv.Version, &pv.Template, &pv.Model, &pv.CreatedAt)
		pvs = append(pvs, pv)
	}
	return pvs, nil
}

// ── Security Events ──

type SecurityEvent struct {
	ID        string `json:"id"`
	Type      string `json:"type"` // prompt_injection, pii_leak, agent_loop, model_drift
	Severity  string `json:"severity"` // critical, high, medium, low
	TraceID   string `json:"trace_id"`
	Service   string `json:"service"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) InsertSecurityEvent(ev *SecurityEvent) error {
	if ev.ID == "" { ev.ID = fmt.Sprintf("sec-%d", time.Now().UnixMilli()) }
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO security_events (id, type, severity, trace_id, service, detail, created_at) VALUES (?,?,?,?,?,?,?)`,
		ev.ID, ev.Type, ev.Severity, ev.TraceID, ev.Service, ev.Detail, now)
	return err
}

func (s *Store) ListSecurityEvents(limit int) ([]SecurityEvent, error) {
	if limit <= 0 { limit = 50 }
	rows, err := s.db.Query(`SELECT id, type, severity, trace_id, service, detail, created_at FROM security_events ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil { return nil, err }
	defer rows.Close()
	var events []SecurityEvent
	for rows.Next() {
		var ev SecurityEvent
		rows.Scan(&ev.ID, &ev.Type, &ev.Severity, &ev.TraceID, &ev.Service, &ev.Detail, &ev.CreatedAt)
		events = append(events, ev)
	}
	return events, nil
}

func (s *Store) GetTokenUsageSummary() ([]TokenUsageSummary, error) {
	rows, err := s.db.Query(`
		SELECT model, provider, COUNT(*) as calls, SUM(input_tokens), SUM(output_tokens), SUM(cost_usd), AVG(latency_ms)
		FROM token_usage
		GROUP BY model, provider
		ORDER BY SUM(cost_usd) DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var summaries []TokenUsageSummary
	for rows.Next() {
		var s2 TokenUsageSummary
		rows.Scan(&s2.Model, &s2.Provider, &s2.TotalCalls, &s2.TotalInput, &s2.TotalOutput, &s2.TotalCost, &s2.AvgLatency)
		summaries = append(summaries, s2)
	}
	return summaries, nil
}

// ── Project CRUD ──

func (s *Store) CreateProject(p *Project) error {
	if p.ID == "" {
		p.ID = fmt.Sprintf("proj-%d", time.Now().UnixMilli())
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO projects (id, name, description, environment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Description, p.Environment, now, now)
	return err
}

func (s *Store) ListProjects() ([]Project, error) {
	rows, err := s.db.Query(`SELECT id, name, description, environment, created_at, updated_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var projects []Project
	for rows.Next() {
		var p Project
		rows.Scan(&p.ID, &p.Name, &p.Description, &p.Environment, &p.CreatedAt, &p.UpdatedAt)
		projects = append(projects, p)
	}
	return projects, nil
}

func (s *Store) GetProject(id string) (*Project, error) {
	var p Project
	err := s.db.QueryRow(`SELECT id, name, description, environment, created_at, updated_at FROM projects WHERE id = ?`, id).
		Scan(&p.ID, &p.Name, &p.Description, &p.Environment, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

func (s *Store) UpdateProject(id string, name, description, environment string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE projects SET name=?, description=?, environment=?, updated_at=? WHERE id=?`,
		name, description, environment, now, id)
	return err
}

func (s *Store) DeleteProject(id string) error {
	// Remove project_id from agents
	s.db.Exec(`UPDATE agents SET project_id='' WHERE project_id=?`, id)
	_, err := s.db.Exec(`DELETE FROM projects WHERE id=?`, id)
	return err
}

// ── Agent Persistence ──

func (s *Store) SaveAgent(rec *agentRecord) error {
	rec.mu.RLock()
	defer rec.mu.RUnlock()
	osmJSON, _ := json.Marshal(rec.OSMetrics)
	_, err := s.db.Exec(`
		INSERT INTO agents (id, hostname, os_type, os_version, agent_version, approved, status, cpu_percent, memory_mb, os_metrics, registered_at, last_heartbeat)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			hostname=excluded.hostname, os_type=excluded.os_type, os_version=excluded.os_version,
			agent_version=excluded.agent_version, approved=excluded.approved, status=excluded.status,
			cpu_percent=excluded.cpu_percent, memory_mb=excluded.memory_mb,
			os_metrics=excluded.os_metrics, last_heartbeat=excluded.last_heartbeat
	`, rec.ID, rec.Hostname, rec.OSType, rec.OSVersion, rec.AgentVersion,
		boolToInt(rec.Approved), string(rec.Status), rec.CPUPercent, rec.MemoryMB,
		string(osmJSON), rec.RegisteredAt.UTC().Format(time.RFC3339), rec.LastHeartbeat.UTC().Format(time.RFC3339))
	return err
}

func (s *Store) LoadAgents() ([]*agentRecord, error) {
	rows, err := s.db.Query(`SELECT id, hostname, os_type, os_version, agent_version, approved, status, cpu_percent, memory_mb, os_metrics, project_id, registered_at, last_heartbeat FROM agents`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []*agentRecord
	for rows.Next() {
		var (
			id, hostname, osType, osVer, agentVer, status, osmStr, projID, regAt, hbAt string
			approved                                                                    int
			cpu, mem                                                                    float64
		)
		rows.Scan(&id, &hostname, &osType, &osVer, &agentVer, &approved, &status, &cpu, &mem, &osmStr, &projID, &regAt, &hbAt)
		rec := &agentRecord{
			ID: id, Hostname: hostname, OSType: osType, OSVersion: osVer,
			AgentVersion: agentVer, Approved: approved == 1,
			CPUPercent: cpu, MemoryMB: mem,
		}
		rec.Status = models.AgentStatus(status)
		rec.RegisteredAt, _ = time.Parse(time.RFC3339, regAt)
		rec.LastHeartbeat, _ = time.Parse(time.RFC3339, hbAt)
		if osmStr != "" && osmStr != "{}" {
			var osm models.OSMetrics
			if json.Unmarshal([]byte(osmStr), &osm) == nil {
				rec.OSMetrics = &osm
			}
		}
		agents = append(agents, rec)
	}
	return agents, nil
}

func (s *Store) SetAgentApproved(agentID string, approved bool) error {
	_, err := s.db.Exec(`UPDATE agents SET approved=? WHERE id=?`, boolToInt(approved), agentID)
	return err
}

func (s *Store) SetAgentProject(agentID, projectID string) error {
	_, err := s.db.Exec(`UPDATE agents SET project_id=? WHERE id=?`, projectID, agentID)
	return err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
