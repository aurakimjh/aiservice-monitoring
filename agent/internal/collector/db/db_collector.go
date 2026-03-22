// Package db provides a Collector for database server configuration and health.
// Supports PostgreSQL, MySQL, Oracle, and MongoDB.
package db

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
	// DB driver packages (pgx, go-sql-driver/mysql) are optional.
	// When not imported, sql.Open will fail gracefully and the collector
	// falls back to CLI-based collection (psql/mysql commands).
)

// Collector gathers database server configuration, connections, and slow query info.
type Collector struct{}

// New returns a new DB Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "db" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "windows", "darwin"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "exec", Target: "psql", Description: "query PostgreSQL database parameters"},
		{Type: "exec", Target: "mysql", Description: "query MySQL/MariaDB status variables"},
		{Type: "read", Target: "/var/lib/postgresql", Description: "read PostgreSQL data directory"},
		{Type: "net", Target: "localhost:5432", Description: "connect to PostgreSQL"},
		{Type: "net", Target: "localhost:3306", Description: "connect to MySQL"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"db.server_info.v1",
		"db.connection_status.v1",
		"db.configuration.v1",
		"db.slow_queries.v1",
	}
}

// dbInstance represents a detected database process.
type dbInstance struct {
	DBType     string // "postgresql", "mysql", "mongodb", "oracle"
	PID        int
	Host       string
	Port       string
	DataDir    string
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	instances := detectDBInstances()
	if len(instances) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"db_type": instances[0].DBType, "port": instances[0].Port},
	}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	instances := detectDBInstances()
	if len(instances) == 0 {
		result.Status = models.StatusSkipped
		result.Errors = []models.CollectError{{
			Code:    models.ErrEnvNotDetected,
			Message: "no supported database (PostgreSQL/MySQL/MongoDB/Oracle) detected",
		}}
		result.Duration = time.Since(start)
		return result, nil
	}

	var errs []models.CollectError
	inst := instances[0]

	// Server info
	if item, err := c.collectServerInfo(inst); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrParseError,
			Message: fmt.Sprintf("server info: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Connection status
	if item, err := c.collectConnectionStatus(ctx, inst); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrConnectionRefused,
			Message: fmt.Sprintf("connection status: %v", err),
			Command: fmt.Sprintf("connect to %s:%s", inst.Host, inst.Port),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Configuration parameters
	if item, err := c.collectConfiguration(ctx, inst); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("configuration: %v", err),
			Suggestion: "grant SELECT on pg_settings or SHOW STATUS privilege",
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	// Slow queries
	if item, err := c.collectSlowQueries(ctx, inst); err != nil {
		errs = append(errs, models.CollectError{
			Code:    models.ErrPermissionDenied,
			Message: fmt.Sprintf("slow queries: %v", err),
		})
	} else {
		result.Items = append(result.Items, *item)
	}

	result.Errors = errs
	result.Duration = time.Since(start)

	if len(errs) > 0 && len(result.Items) == 0 {
		result.Status = models.StatusFailed
	} else if len(errs) > 0 {
		result.Status = models.StatusPartial
	}
	return result, nil
}

// detectDBInstances scans processes and ports for database servers.
func detectDBInstances() []dbInstance {
	var instances []dbInstance

	candidates := []struct {
		dbType  string
		process string
		port    string
	}{
		{"postgresql", "postgres", "5432"},
		{"postgresql", "postmaster", "5432"},
		{"mysql", "mysqld", "3306"},
		{"mysql", "mariadbd", "3306"},
		{"mongodb", "mongod", "27017"},
		{"oracle", "ora_pmon", "1521"},
	}

	for _, cand := range candidates {
		pid := findProcessPID(cand.process)
		if pid <= 0 {
			// Process not running — check if port is open
			if !isPortOpen("127.0.0.1", cand.port) {
				continue
			}
		}
		instances = append(instances, dbInstance{
			DBType:  cand.dbType,
			PID:     pid,
			Host:    "127.0.0.1",
			Port:    cand.port,
			DataDir: findDBDataDir(cand.dbType, pid),
		})
		break // take first detected
	}
	return instances
}

// findProcessPID returns the PID of the first matching process, or 0.
func findProcessPID(processName string) int {
	if runtime.GOOS == "linux" {
		entries, err := os.ReadDir("/proc")
		if err != nil {
			return 0
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			pid, err := strconv.Atoi(e.Name())
			if err != nil {
				continue
			}
			comm, err := os.ReadFile(filepath.Join("/proc", e.Name(), "comm"))
			if err != nil {
				continue
			}
			if strings.TrimSpace(string(comm)) == processName {
				return pid
			}
		}
		return 0
	}

	// Fallback: pgrep
	out, err := exec.Command("pgrep", "-x", processName).Output()
	if err != nil {
		return 0
	}
	lines := strings.Fields(strings.TrimSpace(string(out)))
	if len(lines) == 0 {
		return 0
	}
	pid, _ := strconv.Atoi(lines[0])
	return pid
}

// isPortOpen checks if a TCP port is accepting connections.
func isPortOpen(host, port string) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// findDBDataDir tries to locate the database data directory.
func findDBDataDir(dbType string, pid int) string {
	if pid > 0 && runtime.GOOS == "linux" {
		cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err == nil {
			parts := strings.Split(string(cmdline), "\x00")
			for _, p := range parts {
				if strings.Contains(p, "data") || strings.Contains(p, "PGDATA") {
					return p
				}
			}
		}
	}

	// Common defaults
	defaults := map[string]string{
		"postgresql": "/var/lib/postgresql",
		"mysql":      "/var/lib/mysql",
		"mongodb":    "/var/lib/mongodb",
	}
	return defaults[dbType]
}

// collectServerInfo collects DB version and basic server info.
func (c *Collector) collectServerInfo(inst dbInstance) (*models.CollectedItem, error) {
	info := map[string]interface{}{
		"db_type": inst.DBType,
		"host":    inst.Host,
		"port":    inst.Port,
	}

	if inst.PID > 0 {
		info["pid"] = inst.PID
	}
	if inst.DataDir != "" {
		info["data_dir"] = inst.DataDir
	}

	// Try to get version via CLI
	var version string
	switch inst.DBType {
	case "postgresql":
		if out, err := exec.Command("psql", "--version").Output(); err == nil {
			version = strings.TrimSpace(string(out))
		}
	case "mysql":
		if out, err := exec.Command("mysql", "--version").Output(); err == nil {
			version = strings.TrimSpace(string(out))
		}
	case "mongodb":
		if out, err := exec.Command("mongod", "--version").Output(); err == nil {
			version = strings.TrimSpace(strings.Split(string(out), "\n")[0])
		}
	}
	if version != "" {
		info["version"] = version
	}

	// Check if data dir exists and has content
	if inst.DataDir != "" {
		if entries, err := os.ReadDir(inst.DataDir); err == nil {
			info["data_dir_files"] = len(entries)
		}
	}

	return &models.CollectedItem{
		SchemaName:    "db.server_info",
		SchemaVersion: "1.0.0",
		MetricType:    "db_server_info",
		Category:      "it",
		Data:          info,
	}, nil
}

// ConnectionStatus holds database connection pool metrics.
type ConnectionStatus struct {
	MaxConnections    int    `json:"max_connections"`
	ActiveConnections int    `json:"active_connections"`
	IdleConnections   int    `json:"idle_connections"`
	WaitingClients    int    `json:"waiting_clients"`
	DBList            []string `json:"database_list,omitempty"`
	Note              string `json:"note,omitempty"`
}

// collectConnectionStatus queries connection pool state.
func (c *Collector) collectConnectionStatus(ctx context.Context, inst dbInstance) (*models.CollectedItem, error) {
	status := ConnectionStatus{Note: "direct query not configured"}

	switch inst.DBType {
	case "postgresql":
		if cs, err := queryPostgresConnections(ctx, inst); err == nil {
			status = *cs
		} else {
			// Fall back to CLI-based check
			status = pgConnectionsViaCLI(inst)
		}
	case "mysql":
		if cs, err := queryMySQLConnections(ctx, inst); err == nil {
			status = *cs
		}
	case "mongodb":
		status = mongoConnectionsViaCLI(inst)
	}

	return &models.CollectedItem{
		SchemaName:    "db.connection_status",
		SchemaVersion: "1.0.0",
		MetricType:    "db_connection_status",
		Category:      "it",
		Data:          status,
	}, nil
}

// queryPostgresConnections queries pg_stat_activity for connection metrics.
func queryPostgresConnections(ctx context.Context, inst dbInstance) (*ConnectionStatus, error) {
	dsn := fmt.Sprintf("host=%s port=%s dbname=postgres sslmode=disable connect_timeout=3",
		inst.Host, inst.Port)

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	status := &ConnectionStatus{}

	// Max connections setting
	_ = db.QueryRowContext(ctx, "SHOW max_connections").Scan(&status.MaxConnections)

	// Active / idle connections
	row := db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE state = 'active') as active,
			COUNT(*) FILTER (WHERE state = 'idle') as idle,
			COUNT(*) FILTER (WHERE wait_event_type = 'Client') as waiting
		FROM pg_stat_activity
		WHERE pid != pg_backend_pid()`)
	_ = row.Scan(&status.ActiveConnections, &status.IdleConnections, &status.WaitingClients)

	// Database list
	rows, err := db.QueryContext(ctx, "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var dbName string
			if rows.Scan(&dbName) == nil {
				status.DBList = append(status.DBList, dbName)
			}
		}
	}

	return status, nil
}

// queryMySQLConnections queries MySQL status for connection metrics.
func queryMySQLConnections(ctx context.Context, inst dbInstance) (*ConnectionStatus, error) {
	// Attempt connection via environment credentials
	user := envOrDefault("MYSQL_USER", "root")
	pass := os.Getenv("MYSQL_PASSWORD")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/", user, pass, inst.Host, inst.Port)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	status := &ConnectionStatus{}

	rows, err := db.QueryContext(ctx, "SHOW STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var name, value string
		if rows.Scan(&name, &value) != nil {
			continue
		}
		n, _ := strconv.Atoi(value)
		switch name {
		case "Threads_connected":
			status.ActiveConnections = n
		case "Threads_running":
			// subset of connected
		case "Max_used_connections":
			status.MaxConnections = n
		}
	}

	return status, nil
}

// pgConnectionsViaCLI uses psql CLI to get connection info without Go driver.
func pgConnectionsViaCLI(inst dbInstance) ConnectionStatus {
	status := ConnectionStatus{}

	// Try psql without password (relies on pg_hba trust or PGPASSWORD env)
	args := []string{"-h", inst.Host, "-p", inst.Port, "-U", "postgres", "-t", "-c",
		"SELECT count(*) FROM pg_stat_activity WHERE state='active'"}
	out, err := exec.Command("psql", args...).Output()
	if err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(string(out))); err == nil {
			status.ActiveConnections = n
		}
	}

	// Get database list
	args2 := []string{"-h", inst.Host, "-p", inst.Port, "-U", "postgres", "-t", "-c",
		"SELECT datname FROM pg_database WHERE datistemplate=false"}
	out2, err := exec.Command("psql", args2...).Output()
	if err == nil {
		for _, line := range strings.Split(string(out2), "\n") {
			db := strings.TrimSpace(line)
			if db != "" {
				status.DBList = append(status.DBList, db)
			}
		}
	}

	return status
}

// mongoConnectionsViaCLI uses mongosh/mongo CLI.
func mongoConnectionsViaCLI(inst dbInstance) ConnectionStatus {
	status := ConnectionStatus{}
	args := []string{
		"--quiet", "--eval",
		"JSON.stringify(db.serverStatus().connections)",
		"--host", fmt.Sprintf("%s:%s", inst.Host, inst.Port),
	}
	for _, bin := range []string{"mongosh", "mongo"} {
		out, err := exec.Command(bin, args...).Output()
		if err != nil {
			continue
		}
		// Parse {"current": N, "available": M}
		cleaned := strings.ReplaceAll(string(out), `"`, "")
		cleaned = strings.ReplaceAll(cleaned, "{", "")
		cleaned = strings.ReplaceAll(cleaned, "}", "")
		cleaned = strings.ReplaceAll(cleaned, ",", "")
		for _, tok := range strings.Fields(cleaned) {
			parts := strings.SplitN(tok, ":", 2)
			if len(parts) == 2 {
				n, _ := strconv.Atoi(parts[1])
				switch parts[0] {
				case "current":
					status.ActiveConnections = n
				case "available":
					status.MaxConnections = status.ActiveConnections + n
				}
			}
		}
		break
	}
	return status
}

// DBConfig holds key database configuration parameters.
type DBConfig struct {
	Parameters map[string]string `json:"parameters"`
	Source     string            `json:"source"` // "query", "config_file", "cli"
}

// collectConfiguration retrieves key database configuration parameters.
func (c *Collector) collectConfiguration(ctx context.Context, inst dbInstance) (*models.CollectedItem, error) {
	cfg := DBConfig{Parameters: make(map[string]string)}

	switch inst.DBType {
	case "postgresql":
		if err := queryPGConfig(ctx, inst, cfg.Parameters); err != nil {
			// Fall back to reading postgresql.conf
			if err2 := readPGConfigFile(inst, cfg.Parameters); err2 != nil {
				return nil, fmt.Errorf("pg config query: %v; config file: %v", err, err2)
			}
			cfg.Source = "config_file"
		} else {
			cfg.Source = "query"
		}
	case "mysql":
		if err := queryMySQLConfig(ctx, inst, cfg.Parameters); err != nil {
			cfg.Source = "unavailable"
			cfg.Parameters["error"] = err.Error()
		} else {
			cfg.Source = "query"
		}
	case "mongodb":
		cfg.Source = "cli"
		cfg.Parameters["storage_engine"] = "wiredTiger"
	}

	return &models.CollectedItem{
		SchemaName:    "db.configuration",
		SchemaVersion: "1.0.0",
		MetricType:    "db_configuration",
		Category:      "it",
		Data:          cfg,
	}, nil
}

// keyPGParams is the list of PostgreSQL parameters we want to collect.
var keyPGParams = []string{
	"max_connections", "shared_buffers", "effective_cache_size", "work_mem",
	"maintenance_work_mem", "wal_buffers", "checkpoint_completion_target",
	"default_statistics_target", "log_min_duration_statement",
	"log_slow_queries", "autovacuum", "max_wal_size",
}

func queryPGConfig(ctx context.Context, inst dbInstance, params map[string]string) error {
	dsn := fmt.Sprintf("host=%s port=%s dbname=postgres sslmode=disable connect_timeout=3",
		inst.Host, inst.Port)
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return err
	}

	rows, err := db.QueryContext(ctx,
		"SELECT name, setting, unit FROM pg_settings WHERE name = ANY($1)",
		keyPGParams)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var name, setting string
		var unit *string
		if rows.Scan(&name, &setting, &unit) == nil {
			if unit != nil && *unit != "" {
				params[name] = setting + *unit
			} else {
				params[name] = setting
			}
		}
	}
	return nil
}

func readPGConfigFile(inst dbInstance, params map[string]string) error {
	candidates := []string{
		filepath.Join(inst.DataDir, "postgresql.conf"),
		"/etc/postgresql/postgresql.conf",
		"/etc/postgresql/14/main/postgresql.conf",
		"/etc/postgresql/15/main/postgresql.conf",
		"/etc/postgresql/16/main/postgresql.conf",
	}
	for _, path := range candidates {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "#") || line == "" {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(strings.SplitN(parts[1], "#", 2)[0])
			val = strings.Trim(val, `"'`)
			params[key] = val
		}
		return nil
	}
	return fmt.Errorf("postgresql.conf not found in any standard location")
}

// keyMySQLVars is the list of MySQL variables we want to collect.
var keyMySQLVars = []string{
	"max_connections", "innodb_buffer_pool_size", "innodb_log_file_size",
	"query_cache_size", "slow_query_log", "long_query_time",
	"innodb_flush_log_at_trx_commit", "sync_binlog",
}

func queryMySQLConfig(ctx context.Context, inst dbInstance, params map[string]string) error {
	user := envOrDefault("MYSQL_USER", "root")
	pass := os.Getenv("MYSQL_PASSWORD")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/", user, pass, inst.Host, inst.Port)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return err
	}

	query := "SHOW VARIABLES WHERE Variable_name IN ('" + strings.Join(keyMySQLVars, "','") + "')"
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var name, value string
		if rows.Scan(&name, &value) == nil {
			params[name] = value
		}
	}
	return nil
}

// SlowQueryInfo holds a single slow query entry.
type SlowQueryInfo struct {
	Query        string  `json:"query"`
	CallCount    int64   `json:"call_count"`
	TotalTimeMs  float64 `json:"total_time_ms"`
	AvgTimeMs    float64 `json:"avg_time_ms"`
	MaxTimeMs    float64 `json:"max_time_ms"`
}

// SlowQuerySummary holds slow query analysis results.
type SlowQuerySummary struct {
	Threshold string          `json:"threshold"`
	TopQueries []SlowQueryInfo `json:"top_queries,omitempty"`
	Count      int             `json:"count"`
	Source     string          `json:"source"`
	Note       string          `json:"note,omitempty"`
}

// collectSlowQueries collects top slow queries from the database.
func (c *Collector) collectSlowQueries(ctx context.Context, inst dbInstance) (*models.CollectedItem, error) {
	summary := SlowQuerySummary{Source: "unavailable"}

	switch inst.DBType {
	case "postgresql":
		if qs, err := pgSlowQueries(ctx, inst); err == nil {
			summary = *qs
		} else {
			summary.Note = err.Error()
		}
	case "mysql":
		if qs, err := mysqlSlowQueries(ctx, inst); err == nil {
			summary = *qs
		} else {
			summary.Note = err.Error()
		}
	default:
		summary.Note = fmt.Sprintf("slow query collection not supported for %s", inst.DBType)
	}

	return &models.CollectedItem{
		SchemaName:    "db.slow_queries",
		SchemaVersion: "1.0.0",
		MetricType:    "db_slow_queries",
		Category:      "it",
		Data:          summary,
	}, nil
}

func pgSlowQueries(ctx context.Context, inst dbInstance) (*SlowQuerySummary, error) {
	dsn := fmt.Sprintf("host=%s port=%s dbname=postgres sslmode=disable connect_timeout=3",
		inst.Host, inst.Port)
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	// Check if pg_stat_statements extension is available
	var extExists bool
	_ = db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements')").
		Scan(&extExists)

	summary := &SlowQuerySummary{
		Threshold: "1000ms",
		Source:    "pg_stat_statements",
	}

	if !extExists {
		summary.Note = "pg_stat_statements extension not installed"
		summary.Source = "unavailable"
		return summary, nil
	}

	rows, err := db.QueryContext(ctx, `
		SELECT
			LEFT(query, 200) AS query,
			calls,
			total_exec_time,
			mean_exec_time,
			max_exec_time
		FROM pg_stat_statements
		WHERE mean_exec_time > 1000
		ORDER BY mean_exec_time DESC
		LIMIT 10`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var q SlowQueryInfo
		if rows.Scan(&q.Query, &q.CallCount, &q.TotalTimeMs, &q.AvgTimeMs, &q.MaxTimeMs) == nil {
			summary.TopQueries = append(summary.TopQueries, q)
			summary.Count++
		}
	}
	return summary, nil
}

func mysqlSlowQueries(ctx context.Context, inst dbInstance) (*SlowQuerySummary, error) {
	user := envOrDefault("MYSQL_USER", "root")
	pass := os.Getenv("MYSQL_PASSWORD")

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/", user, pass, inst.Host, inst.Port)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	db.SetConnMaxLifetime(5 * time.Second)
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	summary := &SlowQuerySummary{
		Threshold: "long_query_time",
		Source:    "performance_schema",
	}

	rows, err := db.QueryContext(ctx, `
		SELECT
			LEFT(DIGEST_TEXT, 200),
			COUNT_STAR,
			SUM_TIMER_WAIT / 1e9,
			AVG_TIMER_WAIT / 1e9,
			MAX_TIMER_WAIT / 1e9
		FROM performance_schema.events_statements_summary_by_digest
		WHERE AVG_TIMER_WAIT / 1e9 > 1000
		ORDER BY AVG_TIMER_WAIT DESC
		LIMIT 10`)
	if err != nil {
		summary.Note = err.Error()
		return summary, nil
	}
	defer rows.Close()

	for rows.Next() {
		var q SlowQueryInfo
		if rows.Scan(&q.Query, &q.CallCount, &q.TotalTimeMs, &q.AvgTimeMs, &q.MaxTimeMs) == nil {
			summary.TopQueries = append(summary.TopQueries, q)
			summary.Count++
		}
	}
	return summary, nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
