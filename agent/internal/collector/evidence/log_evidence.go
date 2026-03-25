package evidence

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// logTarget describes a log file to scan for diagnostic patterns.
type logTarget struct {
	itemID   string
	label    string
	paths    []string         // candidate log paths (globs resolved at runtime)
	patterns []*regexp.Regexp // lines matching any pattern are captured
	maxLines int              // maximum matching lines to capture (0 = 200)
}

const defaultMaxLogLines = 200

// logEvidenceCollector scans log files for diagnostic patterns (🔧 builtin).
// Covers: ITEM0008, ITEM0011, ITEM0016, ITEM0026, ITEM0027, ITEM0036, ITEM0055
type logEvidenceCollector struct{}

// NewLogEvidenceCollector creates the LogEvidence collector.
func NewLogEvidenceCollector() EvidenceCollector {
	return &logEvidenceCollector{}
}

func (c *logEvidenceCollector) ID() string        { return "evidence-log" }
func (c *logEvidenceCollector) Version() string   { return "1.0.0" }
func (c *logEvidenceCollector) Category() string  { return "log" }
func (c *logEvidenceCollector) Mode() CollectMode { return ModeBuiltin }
func (c *logEvidenceCollector) CoveredItems() []string {
	return []string{"ITEM0008", "ITEM0011", "ITEM0016", "ITEM0026", "ITEM0027", "ITEM0036", "ITEM0055"}
}

func (c *logEvidenceCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	start := time.Now().UTC()
	res := &EvidenceResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        start,
	}

	for _, t := range logTargets(cfg.ExtraPaths) {
		select {
		case <-ctx.Done():
			return res, ctx.Err()
		default:
		}
		items, errs := scanLogTarget(t)
		res.Items = append(res.Items, items...)
		res.Errors = append(res.Errors, errs...)
	}
	return res, nil
}

// logScanResult is the JSON content of a log evidence item.
type logScanResult struct {
	SourceFile   string   `json:"source_file"`
	PatternHits  []string `json:"pattern_hits"`
	TotalMatches int      `json:"total_matches"`
	Truncated    bool     `json:"truncated,omitempty"`
}

// mustCompile compiles a regex and panics on error (init-time safety net).
func mustCompile(s string) *regexp.Regexp { return regexp.MustCompile(s) }

// logTargets returns the log scan targets.
func logTargets(extra map[string]string) []logTarget {
	override := func(key, def string) string {
		if v, ok := extra[key]; ok {
			return v
		}
		return def
	}

	return []logTarget{
		// ITEM0008 — GC log analysis (JVM Full GC)
		{
			itemID: "ITEM0008",
			label:  "JVM GC log",
			paths: []string{
				override("gc_log", "/var/log/app/gc.log"),
				"/opt/app/logs/gc.log",
				"/tmp/gc.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)full\s+gc`),
				mustCompile(`(?i)pause.*ms`),
				mustCompile(`(?i)gc overhead`),
			},
		},
		// ITEM0011 — Application error log
		{
			itemID: "ITEM0011",
			label:  "Application error log",
			paths: []string{
				override("app_error_log", "/var/log/app/error.log"),
				"/opt/app/logs/error.log",
				"/var/log/app/app.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)\b(error|exception|fatal|panic|critical)\b`),
				mustCompile(`(?i)stack\s*trace`),
				mustCompile(`(?i)caused\s+by`),
			},
		},
		// ITEM0016 — OS system log
		{
			itemID: "ITEM0016",
			label:  "Syslog / journal errors",
			paths: []string{
				override("syslog", "/var/log/syslog"),
				"/var/log/messages",
				"/var/log/kern.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)\b(error|critical|alert|emerg|oom-killer)\b`),
				mustCompile(`(?i)kernel:\s+\w+\s+.*fault`),
			},
		},
		// ITEM0026 — Server engine log (Tomcat/WebLogic/Nginx/Apache)
		{
			itemID: "ITEM0026",
			label:  "Tomcat catalina.out",
			paths: []string{
				override("catalina_out", "/var/log/tomcat/catalina.out"),
				"/opt/tomcat/logs/catalina.out",
				"/usr/share/tomcat/logs/catalina.out",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)(severe|error|exception)`),
				mustCompile(`(?i)java\.lang\.\w+exception`),
			},
		},
		{
			itemID: "ITEM0026",
			label:  "Nginx error log",
			paths: []string{
				override("nginx_error_log", "/var/log/nginx/error.log"),
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)\b(error|crit|alert|emerg)\b`),
			},
		},
		// ITEM0027 — DBMS alert/error log
		{
			itemID: "ITEM0027",
			label:  "MySQL error log",
			paths: []string{
				override("mysql_error_log", "/var/log/mysql/error.log"),
				"/var/log/mysql.err",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)\[error\]`),
				mustCompile(`(?i)\[warning\]`),
				mustCompile(`(?i)innodb.*error`),
			},
		},
		{
			itemID: "ITEM0027",
			label:  "PostgreSQL log",
			paths: []string{
				override("pg_log", "/var/log/postgresql/postgresql.log"),
				"/var/lib/pgsql/data/pg_log/postgresql.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)\bERROR\b`),
				mustCompile(`(?i)\bFATAL\b`),
				mustCompile(`(?i)deadlock`),
			},
		},
		// ITEM0036 — OOME / Statement Cache log
		{
			itemID: "ITEM0036",
			label:  "OOME / Statement Cache errors",
			paths: []string{
				override("app_log", "/var/log/app/error.log"),
				"/opt/app/logs/error.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)outofmemoryerror`),
				mustCompile(`(?i)java\.lang\.OutOfMemoryError`),
				mustCompile(`(?i)statement\s+cache`),
			},
		},
		// ITEM0055 — Log observability quality
		{
			itemID: "ITEM0055",
			label:  "Spring Boot log (structured logging check)",
			paths: []string{
				override("spring_log", "/var/log/app/spring.log"),
				"/opt/app/logs/application.log",
			},
			patterns: []*regexp.Regexp{
				mustCompile(`(?i)traceId|spanId|requestId`),
				mustCompile(`(?i)"level"\s*:`),
			},
		},
	}
}

// scanLogTarget scans the first existing log path that matches t.paths.
func scanLogTarget(t logTarget) ([]EvidenceItem, []EvidenceError) {
	maxLines := t.maxLines
	if maxLines == 0 {
		maxLines = defaultMaxLogLines
	}

	for _, rawPath := range t.paths {
		if rawPath == "" {
			continue
		}
		// Resolve simple glob patterns (e.g., /var/log/app/*.log).
		paths, err := filepath.Glob(rawPath)
		if err != nil || len(paths) == 0 {
			// Not a glob or no match — treat as literal.
			paths = []string{rawPath}
		}

		for _, p := range paths {
			item, scanErr := scanFile(p, t.itemID, t.label, t.patterns, maxLines)
			if scanErr != nil {
				if os.IsNotExist(scanErr) {
					continue
				}
				return nil, []EvidenceError{{
					ItemID:  t.itemID,
					Code:    "READ_ERROR",
					Message: scanErr.Error(),
					Source:  p,
				}}
			}
			if item != nil {
				return []EvidenceItem{*item}, nil
			}
		}
	}
	return nil, nil
}

// scanFile opens path, scans for pattern hits, and returns an EvidenceItem.
func scanFile(path, itemID, label string, patterns []*regexp.Regexp, maxLines int) (*EvidenceItem, error) {
	f, err := os.Open(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var hits []string
	scanner := bufio.NewScanner(f)
	truncated := false
	for scanner.Scan() {
		line := scanner.Text()
		for _, re := range patterns {
			if re.MatchString(line) {
				if len(hits) >= maxLines {
					truncated = true
					break
				}
				hits = append(hits, line)
				break // count each line once
			}
		}
		if truncated {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", path, err)
	}

	content := logScanResult{
		SourceFile:   path,
		PatternHits:  hits,
		TotalMatches: len(hits),
		Truncated:    truncated,
	}

	return &EvidenceItem{
		ItemID:      itemID,
		SchemaName:  fmt.Sprintf("evidence.log.%s.v1", sanitizeName(label)),
		FilePath:    path,
		Content:     content,
		CollectedAt: time.Now().UTC(),
	}, nil
}

