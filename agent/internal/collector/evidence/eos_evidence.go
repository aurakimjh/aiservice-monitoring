package evidence

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// eosProduct describes a product entry from the lifecycle DB.
type eosProduct struct {
	Name       string    `json:"name"`
	Vendor     string    `json:"vendor"`
	Version    string    `json:"version"`
	EOSDate    time.Time `json:"eos_date"`
	EOLDate    time.Time `json:"eol_date"`
	SecureUntil time.Time `json:"secure_until,omitempty"`
}

// eosCheckResult is the result for one detected product.
type eosCheckResult struct {
	Product        string    `json:"product"`
	Vendor         string    `json:"vendor"`
	DetectedVersion string   `json:"detected_version"`
	KnownEOSDate   string    `json:"known_eos_date,omitempty"`
	KnownEOLDate   string    `json:"known_eol_date,omitempty"`
	Status         string    `json:"status"` // "ok", "near-eos", "eos", "eol", "unknown"
	DaysUntilEOS   int       `json:"days_until_eos,omitempty"`
	Message        string    `json:"message,omitempty"`
}

// eosEvidenceCollector checks product versions against the built-in EOS
// lifecycle database (🔧 builtin). Covers: ITEM0068 (17 product families).
type eosEvidenceCollector struct {
	db []eosProduct
}

// NewEOSEvidenceCollector creates the EOSEvidence collector with the
// built-in lifecycle database.
func NewEOSEvidenceCollector() EvidenceCollector {
	return &eosEvidenceCollector{db: builtinEOSDB()}
}

func (c *eosEvidenceCollector) ID() string        { return "evidence-eos" }
func (c *eosEvidenceCollector) Version() string   { return "1.0.0" }
func (c *eosEvidenceCollector) Category() string  { return "eos" }
func (c *eosEvidenceCollector) Mode() CollectMode { return ModeBuiltin }
func (c *eosEvidenceCollector) CoveredItems() []string {
	return []string{"ITEM0068"}
}

func (c *eosEvidenceCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	start := time.Now().UTC()
	res := &EvidenceResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        start,
	}

	detectors := eosDetectors()
	var checks []eosCheckResult

	for _, det := range detectors {
		select {
		case <-ctx.Done():
			return res, ctx.Err()
		default:
		}
		ver, err := det.detect()
		if err != nil || ver == "" {
			continue // product not installed
		}
		check := c.checkVersion(det.product, det.vendor, ver, start)
		checks = append(checks, check)
	}

	// Also check OS kernel version.
	if osVer := detectOSVersion(); osVer != "" {
		check := c.checkVersion("Linux Kernel", "Linux", osVer, start)
		checks = append(checks, check)
	}

	if len(checks) > 0 {
		res.Items = append(res.Items, EvidenceItem{
			ItemID:      "ITEM0068",
			SchemaName:  "evidence.eos.lifecycle_check.v1",
			Content:     checks,
			CollectedAt: start,
		})
	}
	return res, nil
}

// checkVersion looks up the product+version in the DB and returns a status.
func (c *eosEvidenceCollector) checkVersion(product, vendor, version string, now time.Time) eosCheckResult {
	check := eosCheckResult{
		Product:         product,
		Vendor:          vendor,
		DetectedVersion: version,
		Status:          "unknown",
	}
	for _, p := range c.db {
		if !strings.EqualFold(p.Name, product) {
			continue
		}
		if !strings.HasPrefix(strings.ToLower(version), strings.ToLower(p.Version)) {
			continue
		}
		check.KnownEOSDate = p.EOSDate.Format("2006-01-02")
		check.KnownEOLDate = p.EOLDate.Format("2006-01-02")
		days := int(p.EOSDate.Sub(now).Hours() / 24)
		check.DaysUntilEOS = days
		switch {
		case now.After(p.EOLDate):
			check.Status = "eol"
			check.Message = fmt.Sprintf("%s %s has reached end-of-life (%s)", product, version, check.KnownEOLDate)
		case now.After(p.EOSDate):
			check.Status = "eos"
			check.Message = fmt.Sprintf("%s %s has reached end-of-support (%s)", product, version, check.KnownEOSDate)
		case days <= 180:
			check.Status = "near-eos"
			check.Message = fmt.Sprintf("%s %s reaches EOS in %d days (%s)", product, version, days, check.KnownEOSDate)
		default:
			check.Status = "ok"
		}
		return check
	}
	return check
}

// ─── OS version detection ─────────────────────────────────────────────────────

func detectOSVersion() string {
	if runtime.GOOS != "linux" {
		return ""
	}
	data, err := os.ReadFile("/proc/version")
	if err != nil {
		return ""
	}
	// e.g. "Linux version 5.15.0-91-generic ..."
	parts := strings.Fields(string(data))
	if len(parts) >= 3 {
		return parts[2]
	}
	return ""
}

// ─── product detector helpers ─────────────────────────────────────────────────

type eosDetector struct {
	product string
	vendor  string
	detect  func() (string, error)
}

func eosDetectors() []eosDetector {
	return []eosDetector{
		{
			product: "Java SE",
			vendor:  "Oracle / OpenJDK",
			detect:  detectJavaVersion,
		},
		{
			product: "Node.js",
			vendor:  "OpenJS Foundation",
			detect:  func() (string, error) { return runVersionCmd("node", "--version") },
		},
		{
			product: "Python",
			vendor:  "PSF",
			detect:  func() (string, error) { return runVersionCmd("python3", "--version") },
		},
		{
			product: "Go",
			vendor:  "Google",
			detect:  func() (string, error) { return runVersionCmd("go", "version") },
		},
		{
			product: "MySQL",
			vendor:  "Oracle",
			detect:  func() (string, error) { return runVersionCmd("mysqld", "--version") },
		},
		{
			product: "PostgreSQL",
			vendor:  "PostgreSQL Global Development Group",
			detect:  func() (string, error) { return runVersionCmd("postgres", "--version") },
		},
		{
			product: "Redis",
			vendor:  "Redis Ltd",
			detect:  func() (string, error) { return runVersionCmd("redis-server", "--version") },
		},
		{
			product: "Nginx",
			vendor:  "Nginx Inc",
			detect:  func() (string, error) { return runVersionCmd("nginx", "-v") },
		},
		{
			product: "Apache HTTP Server",
			vendor:  "Apache Software Foundation",
			detect:  func() (string, error) { return runVersionCmd("httpd", "-v") },
		},
	}
}

func runVersionCmd(cmd string, args ...string) (string, error) {
	out, err := exec.Command(cmd, args...).CombinedOutput()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func detectJavaVersion() (string, error) {
	out, err := exec.Command("java", "-version").CombinedOutput()
	if err != nil {
		return "", err
	}
	// e.g. 'openjdk version "17.0.9" 2023-10-17'
	line := strings.TrimSpace(string(out))
	if idx := strings.Index(line, `"`); idx >= 0 {
		rest := line[idx+1:]
		if end := strings.Index(rest, `"`); end >= 0 {
			return rest[:end], nil
		}
	}
	return line, nil
}

// ─── built-in EOS lifecycle database ─────────────────────────────────────────
// This database is updated as part of the agent release cycle (Phase 33 plugin).
// Dates are approximate end-of-security-support dates from vendor advisories.

func builtinEOSDB() []eosProduct {
	parse := func(s string) time.Time {
		t, _ := time.Parse("2006-01-02", s)
		return t
	}
	return []eosProduct{
		// Java SE
		{Name: "Java SE", Vendor: "Oracle / OpenJDK", Version: "8",  EOSDate: parse("2030-12-31"), EOLDate: parse("2030-12-31")},
		{Name: "Java SE", Vendor: "Oracle / OpenJDK", Version: "11", EOSDate: parse("2026-09-30"), EOLDate: parse("2027-09-30")},
		{Name: "Java SE", Vendor: "Oracle / OpenJDK", Version: "17", EOSDate: parse("2029-09-30"), EOLDate: parse("2029-09-30")},
		{Name: "Java SE", Vendor: "Oracle / OpenJDK", Version: "21", EOSDate: parse("2031-09-30"), EOLDate: parse("2031-09-30")},
		// Node.js (LTS only)
		{Name: "Node.js", Vendor: "OpenJS Foundation", Version: "18", EOSDate: parse("2025-04-30"), EOLDate: parse("2025-04-30")},
		{Name: "Node.js", Vendor: "OpenJS Foundation", Version: "20", EOSDate: parse("2026-04-30"), EOLDate: parse("2026-04-30")},
		{Name: "Node.js", Vendor: "OpenJS Foundation", Version: "22", EOSDate: parse("2027-04-30"), EOLDate: parse("2027-04-30")},
		// Python
		{Name: "Python", Vendor: "PSF", Version: "3.8", EOSDate: parse("2024-10-31"), EOLDate: parse("2024-10-31")},
		{Name: "Python", Vendor: "PSF", Version: "3.9", EOSDate: parse("2025-10-05"), EOLDate: parse("2025-10-05")},
		{Name: "Python", Vendor: "PSF", Version: "3.10", EOSDate: parse("2026-10-04"), EOLDate: parse("2026-10-04")},
		{Name: "Python", Vendor: "PSF", Version: "3.11", EOSDate: parse("2027-10-24"), EOLDate: parse("2027-10-24")},
		{Name: "Python", Vendor: "PSF", Version: "3.12", EOSDate: parse("2028-10-02"), EOLDate: parse("2028-10-02")},
		// Go
		{Name: "Go", Vendor: "Google", Version: "1.21", EOSDate: parse("2024-08-06"), EOLDate: parse("2024-08-06")},
		{Name: "Go", Vendor: "Google", Version: "1.22", EOSDate: parse("2025-02-01"), EOLDate: parse("2025-02-01")},
		{Name: "Go", Vendor: "Google", Version: "1.23", EOSDate: parse("2025-08-01"), EOLDate: parse("2025-08-01")},
		{Name: "Go", Vendor: "Google", Version: "1.24", EOSDate: parse("2026-02-01"), EOLDate: parse("2026-02-01")},
		// MySQL
		{Name: "MySQL", Vendor: "Oracle", Version: "5.7", EOSDate: parse("2023-10-31"), EOLDate: parse("2023-10-31")},
		{Name: "MySQL", Vendor: "Oracle", Version: "8.0", EOSDate: parse("2026-04-30"), EOLDate: parse("2026-04-30")},
		{Name: "MySQL", Vendor: "Oracle", Version: "8.4", EOSDate: parse("2032-04-30"), EOLDate: parse("2032-04-30")},
		// PostgreSQL
		{Name: "PostgreSQL", Vendor: "PostgreSQL GDG", Version: "13", EOSDate: parse("2025-11-13"), EOLDate: parse("2025-11-13")},
		{Name: "PostgreSQL", Vendor: "PostgreSQL GDG", Version: "14", EOSDate: parse("2026-11-12"), EOLDate: parse("2026-11-12")},
		{Name: "PostgreSQL", Vendor: "PostgreSQL GDG", Version: "15", EOSDate: parse("2027-11-11"), EOLDate: parse("2027-11-11")},
		{Name: "PostgreSQL", Vendor: "PostgreSQL GDG", Version: "16", EOSDate: parse("2028-11-09"), EOLDate: parse("2028-11-09")},
		// Redis
		{Name: "Redis", Vendor: "Redis Ltd", Version: "6.2", EOSDate: parse("2024-03-31"), EOLDate: parse("2024-03-31")},
		{Name: "Redis", Vendor: "Redis Ltd", Version: "7.0", EOSDate: parse("2025-07-31"), EOLDate: parse("2025-07-31")},
		{Name: "Redis", Vendor: "Redis Ltd", Version: "7.2", EOSDate: parse("2026-07-31"), EOLDate: parse("2026-07-31")},
		// Nginx
		{Name: "Nginx", Vendor: "Nginx Inc", Version: "1.18", EOSDate: parse("2021-04-20"), EOLDate: parse("2021-04-20")},
		{Name: "Nginx", Vendor: "Nginx Inc", Version: "1.20", EOSDate: parse("2023-05-23"), EOLDate: parse("2023-05-23")},
		{Name: "Nginx", Vendor: "Nginx Inc", Version: "1.22", EOSDate: parse("2024-10-24"), EOLDate: parse("2024-10-24")},
		// Apache HTTP Server
		{Name: "Apache HTTP Server", Vendor: "ASF", Version: "2.2", EOSDate: parse("2018-01-01"), EOLDate: parse("2018-01-01")},
		{Name: "Apache HTTP Server", Vendor: "ASF", Version: "2.4", EOSDate: parse("2030-12-31"), EOLDate: parse("2030-12-31")},
	}
}
