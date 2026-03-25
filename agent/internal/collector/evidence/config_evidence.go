package evidence

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// configTarget describes a single config file to snapshot.
type configTarget struct {
	itemID   string
	label    string
	paths    []string // candidate paths; first existing one wins
	maxBytes int64    // 0 = no limit (capped at 64 KiB default)
}

const defaultMaxConfigBytes = 64 * 1024 // 64 KiB

// configEvidenceCollector collects configuration file snapshots (🔧 builtin).
// Covers: ITEM0009, ITEM0012, ITEM0041, ITEM0045, ITEM0051, ITEM0052
type configEvidenceCollector struct{}

// NewConfigEvidenceCollector creates the ConfigEvidence collector.
func NewConfigEvidenceCollector() EvidenceCollector {
	return &configEvidenceCollector{}
}

func (c *configEvidenceCollector) ID() string       { return "evidence-config" }
func (c *configEvidenceCollector) Version() string  { return "1.0.0" }
func (c *configEvidenceCollector) Category() string { return "config" }
func (c *configEvidenceCollector) Mode() CollectMode { return ModeBuiltin }
func (c *configEvidenceCollector) CoveredItems() []string {
	return []string{"ITEM0009", "ITEM0012", "ITEM0041", "ITEM0045", "ITEM0051", "ITEM0052"}
}

func (c *configEvidenceCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	start := time.Now().UTC()
	res := &EvidenceResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        start,
	}

	for _, t := range configTargets(runtime.GOOS, cfg.ExtraPaths) {
		select {
		case <-ctx.Done():
			return res, ctx.Err()
		default:
		}
		item, errs := readConfigTarget(t)
		res.Items = append(res.Items, item...)
		res.Errors = append(res.Errors, errs...)
	}
	return res, nil
}

// configTargets returns the list of config files to collect for the given OS.
func configTargets(goos string, extra map[string]string) []configTarget {
	// Override path helper: if the caller supplies an override for a key, use it.
	override := func(key, defaultPath string) string {
		if v, ok := extra[key]; ok {
			return v
		}
		return defaultPath
	}

	if goos == "windows" {
		return []configTarget{
			{
				itemID: "ITEM0009",
				label:  "JVM options (Windows)",
				paths:  []string{override("jvm_opts", `C:\Program Files\Java\jre\lib\management\jmxremote.password`)},
			},
		}
	}

	// Linux / macOS
	return []configTarget{
		// ITEM0009 — Runtime configuration options (multi-language)
		{
			itemID: "ITEM0009",
			label:  "Nginx main config",
			paths:  []string{override("nginx_conf", "/etc/nginx/nginx.conf"), "/usr/local/nginx/conf/nginx.conf"},
		},
		{
			itemID: "ITEM0009",
			label:  "Apache httpd config",
			paths:  []string{override("httpd_conf", "/etc/httpd/conf/httpd.conf"), "/etc/apache2/apache2.conf"},
		},
		{
			itemID: "ITEM0009",
			label:  "Tomcat server.xml",
			paths:  []string{override("tomcat_server_xml", "/etc/tomcat/server.xml"), "/opt/tomcat/conf/server.xml", "/usr/share/tomcat/conf/server.xml"},
		},
		{
			itemID: "ITEM0009",
			label:  "JVM options (catalina.sh)",
			paths:  []string{override("catalina_sh", "/opt/tomcat/bin/catalina.sh"), "/usr/share/tomcat/bin/catalina.sh"},
		},
		// ITEM0012 — OS Kernel settings
		{
			itemID: "ITEM0012",
			label:  "sysctl.conf",
			paths:  []string{override("sysctl_conf", "/etc/sysctl.conf"), "/etc/sysctl.d/99-sysctl.conf"},
		},
		// ITEM0041 — nsswitch / DNS config
		{
			itemID: "ITEM0041",
			label:  "nsswitch.conf",
			paths:  []string{override("nsswitch_conf", "/etc/nsswitch.conf")},
		},
		{
			itemID: "ITEM0041",
			label:  "resolv.conf",
			paths:  []string{override("resolv_conf", "/etc/resolv.conf")},
		},
		{
			itemID: "ITEM0041",
			label:  "/etc/hosts",
			paths:  []string{override("hosts", "/etc/hosts")},
		},
		// ITEM0045 — Mount options
		{
			itemID: "ITEM0045",
			label:  "fstab",
			paths:  []string{override("fstab", "/etc/fstab")},
		},
		// ITEM0051 — Circuit-breaker / retry policy
		{
			itemID: "ITEM0051",
			label:  "Istio destinationrule (default ns)",
			paths:  []string{override("istio_dr", "/etc/istio/config/destinationrule.yaml")},
		},
		// ITEM0052 — DB connection-pool config
		{
			itemID: "ITEM0052",
			label:  "HikariCP / Spring datasource config",
			paths:  []string{override("spring_app_yml", "/app/config/application.yml"), "/opt/app/config/application.yml"},
		},
		// MySQL config
		{
			itemID: "ITEM0009",
			label:  "MySQL my.cnf",
			paths:  []string{override("my_cnf", "/etc/mysql/my.cnf"), "/etc/my.cnf", "/etc/mysql/mysql.conf.d/mysqld.cnf"},
		},
	}
}

// readConfigTarget attempts to read the first existing file from t.paths.
func readConfigTarget(t configTarget) ([]EvidenceItem, []EvidenceError) {
	limit := t.maxBytes
	if limit == 0 {
		limit = defaultMaxConfigBytes
	}

	for _, p := range t.paths {
		if p == "" {
			continue
		}
		data, err := readFileLimited(p, limit)
		if err != nil {
			if os.IsNotExist(err) {
				continue // try next candidate
			}
			return nil, []EvidenceError{{
				ItemID:  t.itemID,
				Code:    "READ_ERROR",
				Message: err.Error(),
				Source:  p,
			}}
		}
		sum := fmt.Sprintf("%x", sha256.Sum256(data))
		item := EvidenceItem{
			ItemID:      t.itemID,
			SchemaName:  fmt.Sprintf("evidence.config.%s.v1", sanitizeName(t.label)),
			FilePath:    p,
			Checksum:    sum,
			Content:     string(data),
			CollectedAt: time.Now().UTC(),
		}
		return []EvidenceItem{item}, nil
	}
	// No file found — not necessarily an error (service may not be installed)
	return nil, nil
}

// readFileLimited reads at most maxBytes from path.
func readFileLimited(path string, maxBytes int64) ([]byte, error) {
	f, err := os.Open(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	buf := make([]byte, maxBytes)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return nil, err
	}
	return buf[:n], nil
}

// sanitizeName replaces spaces and slashes with underscores for schema names.
func sanitizeName(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "_")
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "(", "")
	s = strings.ReplaceAll(s, ")", "")
	return s
}
