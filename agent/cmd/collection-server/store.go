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
	`)
	return err
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
