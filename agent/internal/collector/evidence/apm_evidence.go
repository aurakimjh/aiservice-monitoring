package evidence

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// apmAdapter describes a single APM SaaS integration.
type apmAdapter struct {
	name       string
	configKeys []string // environment variable names or config file keys
	configPaths []string
	healthURL   string
}

// apmEvidenceCollector checks APM agent configuration suitability.
// Covers: ITEM0054 (WhaTap / New Relic / Datadog / Dynatrace / Scouter / OA).
// Mode: ModeBuiltin (config file read) + light API probe.
type apmEvidenceCollector struct{}

// NewAPMEvidenceCollector creates the APMEvidence collector.
func NewAPMEvidenceCollector() EvidenceCollector {
	return &apmEvidenceCollector{}
}

func (c *apmEvidenceCollector) ID() string        { return "evidence-apm" }
func (c *apmEvidenceCollector) Version() string   { return "1.0.0" }
func (c *apmEvidenceCollector) Category() string  { return "apm" }
func (c *apmEvidenceCollector) Mode() CollectMode { return ModeBuiltin }
func (c *apmEvidenceCollector) CoveredItems() []string {
	return []string{"ITEM0054"}
}

// apmCheckResult is the result for one APM product.
type apmCheckResult struct {
	Product       string            `json:"product"`
	Detected      bool              `json:"detected"`
	ConfigFound   []string          `json:"config_found,omitempty"`
	ConfigSnippet map[string]string `json:"config_snippet,omitempty"`
	AgentVersion  string            `json:"agent_version,omitempty"`
	Warnings      []string          `json:"warnings,omitempty"`
}

var apmAdapters = []apmAdapter{
	{
		name:        "WhaTap",
		configPaths: []string{"/usr/whatap/agent/whatap.conf", "/opt/whatap/whatap.conf"},
		configKeys:  []string{"whatap_server_host", "license"},
	},
	{
		name:        "New Relic",
		configPaths: []string{"/etc/newrelic/newrelic.yml", "/usr/local/etc/newrelic.yml"},
		configKeys:  []string{"license_key", "app_name"},
	},
	{
		name:        "Datadog",
		configPaths: []string{"/etc/datadog-agent/datadog.yaml"},
		configKeys:  []string{"api_key", "site"},
	},
	{
		name:        "Dynatrace",
		configPaths: []string{"/opt/dynatrace/oneagent/agent/config/deployment.conf"},
		configKeys:  []string{"server", "tenant"},
	},
	{
		name:        "Scouter",
		configPaths: []string{"/opt/scouter/agent.java/conf/scouter.conf"},
		configKeys:  []string{"net_collector_ip", "obj_name"},
	},
	{
		name:        "OpenTelemetry (OA)",
		configPaths: []string{"/etc/otelcol/config.yaml", "/opt/otelcol/config.yaml"},
		configKeys:  []string{"exporters", "receivers"},
	},
}

func (c *apmEvidenceCollector) Collect(ctx context.Context, cfg EvidenceConfig) (*EvidenceResult, error) {
	start := time.Now().UTC()
	res := &EvidenceResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		CollectMode:      ModeBuiltin,
		AgentID:          cfg.AgentID,
		Hostname:         cfg.Hostname,
		Timestamp:        start,
	}

	var checks []apmCheckResult
	httpCl := &http.Client{Timeout: 3 * time.Second}

	for _, adapter := range apmAdapters {
		select {
		case <-ctx.Done():
			return res, ctx.Err()
		default:
		}
		check := checkAPMAdapter(adapter, cfg.ExtraPaths, httpCl)
		checks = append(checks, check)
	}

	res.Items = append(res.Items, EvidenceItem{
		ItemID:      "ITEM0054",
		SchemaName:  "evidence.apm.config_check.v1",
		Content:     checks,
		CollectedAt: start,
	})
	return res, nil
}

func checkAPMAdapter(a apmAdapter, extra map[string]string, cl *http.Client) apmCheckResult {
	result := apmCheckResult{Product: a.name}

	// Check for config files.
	paths := append([]string{}, a.configPaths...) //nolint:gocritic
	if override, ok := extra["apm_"+strings.ToLower(strings.ReplaceAll(a.name, " ", "_"))+"_config"]; ok {
		paths = append([]string{override}, paths...)
	}

	snippet := map[string]string{}
	for _, p := range paths {
		content, err := readFileLimited(filepath.Clean(p), 8192)
		if err != nil {
			continue
		}
		result.Detected = true
		result.ConfigFound = append(result.ConfigFound, p)
		for _, k := range a.configKeys {
			snippet[k] = extractConfigValue(string(content), k)
		}
	}
	result.ConfigSnippet = snippet

	// Redact sensitive keys.
	for _, sensitiveKey := range []string{"license_key", "api_key", "license", "token"} {
		if _, ok := snippet[sensitiveKey]; ok {
			snippet[sensitiveKey] = "[REDACTED]"
		}
	}

	// Environment variable detection (no values — just presence).
	envKeys := map[string]string{
		"WhaTap":              "WHATAP_HOME",
		"New Relic":           "NEW_RELIC_LICENSE_KEY",
		"Datadog":             "DD_API_KEY",
		"Dynatrace":           "DT_TENANT",
		"OpenTelemetry (OA)": "OTEL_EXPORTER_OTLP_ENDPOINT",
	}
	if envKey, ok := envKeys[a.name]; ok {
		if os.Getenv(envKey) != "" {
			result.Detected = true
			result.ConfigSnippet["env_"+envKey] = "[SET]"
		}
	}

	// Health probe for local agents that expose a status endpoint.
	if a.healthURL != "" && cl != nil {
		resp, err := cl.Get(a.healthURL)
		if err == nil {
			defer resp.Body.Close()
			var body map[string]interface{}
			if json.NewDecoder(resp.Body).Decode(&body) == nil {
				if ver, ok := body["version"].(string); ok {
					result.AgentVersion = ver
				}
			}
		}
	}

	if result.Detected && len(result.ConfigFound) == 0 && len(result.ConfigSnippet) == 0 {
		result.Warnings = append(result.Warnings, "detected via env var only; no config file found")
	}

	return result
}

// extractConfigValue extracts the value for a simple key=value or key: value pattern.
func extractConfigValue(content, key string) string {
	for _, line := range strings.Split(content, "\n") {
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "#") {
			continue
		}
		// YAML style: "key: value"
		if strings.HasPrefix(stripped, key+":") {
			return strings.TrimSpace(strings.TrimPrefix(stripped, key+":"))
		}
		// Properties style: "key=value"
		if strings.HasPrefix(stripped, key+"=") {
			return strings.TrimSpace(strings.TrimPrefix(stripped, key+"="))
		}
	}
	return ""
}

// ── sentinel needed to satisfy interface for the unused fmt import ────────────
var _ = fmt.Sprintf
