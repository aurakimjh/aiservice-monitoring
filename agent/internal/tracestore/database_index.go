package tracestore

import (
	"sort"
	"sync"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/otlp"
)

// ── E1-1 / E1-2: Database Entity Auto-Detection from Trace Spans ─────────────
//
// DatabaseIndex extracts database entities from span attributes following
// OpenTelemetry semantic conventions:
//   - db.system    → database type (postgresql, mysql, redis, qdrant, kafka)
//   - db.name      → database/keyspace name
//   - server.address → hostname or IP
//   - server.port  → port number
//   - db.statement → SQL/query text (for slow query tracking)
//
// The index maintains:
//   - A catalogue of all observed databases
//   - N:M mapping of Service ↔ Database relationships
//   - Slow query tracking (top-N by duration)

// DatabaseInfo describes a single observed database.
type DatabaseInfo struct {
	ID         string    `json:"id"`
	System     string    `json:"system"`     // postgresql, mysql, redis, qdrant, kafka
	Name       string    `json:"name"`       // database/keyspace name
	Endpoint   string    `json:"endpoint"`   // host:port
	Host       string    `json:"host"`
	Port       string    `json:"port"`
	Status     string    `json:"status"`     // online, degraded
	FirstSeen  time.Time `json:"firstSeen"`
	LastSeen   time.Time `json:"lastSeen"`
	QueryCount int64     `json:"queryCount"`
	ErrorCount int64     `json:"errorCount"`
	AvgLatency float64   `json:"avgLatencyMs"`
	// Connected services (N:M).
	Services []string `json:"services"`
}

// SlowQuery tracks an observed slow database query.
type SlowQuery struct {
	Statement  string    `json:"statement"`
	DurationMS float64   `json:"durationMs"`
	Service    string    `json:"service"`
	Database   string    `json:"database"`
	Timestamp  time.Time `json:"timestamp"`
}

// ServiceDBEdge represents a Service → Database dependency.
type ServiceDBEdge struct {
	ServiceName  string `json:"service"`
	DatabaseID   string `json:"databaseId"`
	DatabaseName string `json:"databaseName"`
	System       string `json:"system"`
	QueryCount   int64  `json:"queryCount"`
	AvgLatencyMS float64 `json:"avgLatencyMs"`
}

// DatabaseIndex maintains a live catalogue of observed databases from trace spans.
type DatabaseIndex struct {
	mu sync.RWMutex

	databases map[string]*DatabaseInfo // dbKey → info
	// service → set of dbKeys
	serviceDBs map[string]map[string]bool
	// Slow queries ring (last 100)
	slowQueries []SlowQuery
	// latency accumulators per db
	latencySum   map[string]float64
	latencyCount map[string]int64
}

const maxSlowQueries = 100
const slowQueryThresholdMS = 100.0

// NewDatabaseIndex creates a ready-to-use DatabaseIndex.
func NewDatabaseIndex() *DatabaseIndex {
	return &DatabaseIndex{
		databases:    make(map[string]*DatabaseInfo),
		serviceDBs:   make(map[string]map[string]bool),
		latencySum:   make(map[string]float64),
		latencyCount: make(map[string]int64),
	}
}

// Ingest processes a batch of spans and extracts database entities.
func (di *DatabaseIndex) Ingest(spans []*otlp.Span) {
	if len(spans) == 0 {
		return
	}

	di.mu.Lock()
	defer di.mu.Unlock()

	now := time.Now().UTC()

	for _, sp := range spans {
		dbSystem := sp.Attributes["db.system"]
		if dbSystem == "" {
			continue // not a database span
		}

		dbName := sp.Attributes["db.name"]
		host := sp.Attributes["server.address"]
		port := sp.Attributes["server.port"]
		statement := sp.Attributes["db.statement"]

		if host == "" {
			host = sp.Attributes["net.peer.name"]
		}
		if port == "" {
			port = sp.Attributes["net.peer.port"]
		}
		if port == "" {
			port = defaultPort(dbSystem)
		}

		endpoint := host
		if port != "" {
			endpoint = host + ":" + port
		}

		// Build deterministic key: system/host:port/dbname
		dbKey := dbSystem + "/" + endpoint
		if dbName != "" {
			dbKey += "/" + dbName
		}

		// Upsert database record.
		db, exists := di.databases[dbKey]
		if !exists {
			db = &DatabaseInfo{
				ID:        "db-" + sanitizeID(dbKey),
				System:    dbSystem,
				Name:      dbName,
				Endpoint:  endpoint,
				Host:      host,
				Port:      port,
				Status:    "online",
				FirstSeen: now,
			}
			di.databases[dbKey] = db
		}
		db.LastSeen = now
		db.QueryCount++
		if sp.StatusCode == otlp.StatusError {
			db.ErrorCount++
		}

		// Track latency.
		durationMS := float64(sp.DurationNano) / 1e6
		di.latencySum[dbKey] += durationMS
		di.latencyCount[dbKey]++
		if di.latencyCount[dbKey] > 0 {
			db.AvgLatency = di.latencySum[dbKey] / float64(di.latencyCount[dbKey])
		}

		// Service ↔ DB edge.
		svc := sp.ServiceName
		if svc != "" {
			if di.serviceDBs[svc] == nil {
				di.serviceDBs[svc] = make(map[string]bool)
			}
			di.serviceDBs[svc][dbKey] = true
			if !containsStr(db.Services, svc) {
				db.Services = append(db.Services, svc)
			}
		}

		// Slow query tracking.
		if statement != "" && durationMS >= slowQueryThresholdMS {
			sq := SlowQuery{
				Statement:  truncate(statement, 500),
				DurationMS: durationMS,
				Service:    svc,
				Database:   dbKey,
				Timestamp:  sp.StartTime,
			}
			if len(di.slowQueries) >= maxSlowQueries {
				di.slowQueries = di.slowQueries[1:] // ring: drop oldest
			}
			di.slowQueries = append(di.slowQueries, sq)
		}
	}
}

// Databases returns a snapshot of all known databases sorted by name.
func (di *DatabaseIndex) Databases() []*DatabaseInfo {
	di.mu.RLock()
	defer di.mu.RUnlock()

	out := make([]*DatabaseInfo, 0, len(di.databases))
	for _, db := range di.databases {
		cp := *db
		cp.Services = append([]string{}, db.Services...) // copy slice
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// GetDatabase returns a single database by ID.
func (di *DatabaseIndex) GetDatabase(id string) *DatabaseInfo {
	di.mu.RLock()
	defer di.mu.RUnlock()

	for _, db := range di.databases {
		if db.ID == id {
			cp := *db
			cp.Services = append([]string{}, db.Services...)
			return &cp
		}
	}
	return nil
}

// DatabasesForService returns databases connected to a service.
func (di *DatabaseIndex) DatabasesForService(serviceName string) []*DatabaseInfo {
	di.mu.RLock()
	defer di.mu.RUnlock()

	dbKeys := di.serviceDBs[serviceName]
	if len(dbKeys) == 0 {
		return nil
	}
	out := make([]*DatabaseInfo, 0, len(dbKeys))
	for key := range dbKeys {
		if db, ok := di.databases[key]; ok {
			cp := *db
			out = append(out, &cp)
		}
	}
	return out
}

// SlowQueries returns the most recent slow queries, optionally filtered by database ID.
func (di *DatabaseIndex) SlowQueries(databaseID string, limit int) []SlowQuery {
	di.mu.RLock()
	defer di.mu.RUnlock()

	var out []SlowQuery
	// Iterate newest first.
	for i := len(di.slowQueries) - 1; i >= 0; i-- {
		sq := di.slowQueries[i]
		if databaseID != "" {
			// Match by dbKey containing the ID fragment.
			dbKey := sq.Database
			db := di.databases[dbKey]
			if db == nil || db.ID != databaseID {
				continue
			}
		}
		out = append(out, sq)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

// ServiceDBEdges returns all Service → Database dependency edges.
func (di *DatabaseIndex) ServiceDBEdges() []ServiceDBEdge {
	di.mu.RLock()
	defer di.mu.RUnlock()

	var edges []ServiceDBEdge
	for svc, dbKeys := range di.serviceDBs {
		for dbKey := range dbKeys {
			db := di.databases[dbKey]
			if db == nil {
				continue
			}
			edges = append(edges, ServiceDBEdge{
				ServiceName:  svc,
				DatabaseID:   db.ID,
				DatabaseName: db.Name,
				System:       db.System,
				QueryCount:   db.QueryCount,
				AvgLatencyMS: db.AvgLatency,
			})
		}
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].ServiceName != edges[j].ServiceName {
			return edges[i].ServiceName < edges[j].ServiceName
		}
		return edges[i].DatabaseID < edges[j].DatabaseID
	})
	return edges
}

// ── helpers ──────────────────────────────────────────────────────────────────

func defaultPort(system string) string {
	switch system {
	case "postgresql":
		return "5432"
	case "mysql":
		return "3306"
	case "redis":
		return "6379"
	case "qdrant":
		return "6333"
	case "kafka":
		return "9092"
	case "mongodb":
		return "27017"
	case "elasticsearch":
		return "9200"
	default:
		return ""
	}
}

func sanitizeID(s string) string {
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' {
			b = append(b, c)
		} else {
			b = append(b, '-')
		}
	}
	return string(b)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
