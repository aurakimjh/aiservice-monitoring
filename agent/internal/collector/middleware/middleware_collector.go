// Package middleware provides language-specific runtime middleware collectors.
// Supports Java, .NET, Node.js, Python, and Go runtime metrics including:
// thread pools, connection pools, event loops, worker pools, and goroutines.
package middleware

import (
	"context"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector is the top-level middleware collector that auto-detects the runtime language
// and delegates to the appropriate language-specific sub-collector.
type Collector struct{}

// New returns a new Middleware Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "middleware" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "exec", Target: "jcmd", Description: "collect JVM thread/connection pool stats via jcmd"},
		{Type: "exec", Target: "dotnet-counters", Description: "collect .NET CLR counters"},
		{Type: "net", Target: "localhost:9600", Description: "Node.js diagnostics (socket)"},
		{Type: "net", Target: "localhost:8005", Description: "Gunicorn stats socket"},
		{Type: "net", Target: "localhost:6060", Description: "Go pprof / debug/vars endpoint"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"middleware.java.v1",
		"middleware.dotnet.v1",
		"middleware.nodejs.v1",
		"middleware.python.v1",
		"middleware.go.v1",
		"middleware.connection_pool.v1",
	}
}

// DetectedLanguage encodes a discovered runtime language and its process info.
type DetectedLanguage struct {
	Language string // "java", "dotnet", "nodejs", "python", "go"
	PID      int
	Detail   string // e.g. "tomcat", "aspnetcore", "express"
}

// AutoDetect scans running processes to identify which language runtimes are active.
func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	langs := DetectLanguages()
	if len(langs) == 0 {
		return models.DetectResult{Detected: false}, nil
	}
	names := make([]string, 0, len(langs))
	for _, l := range langs {
		names = append(names, l.Language)
	}
	return models.DetectResult{
		Detected: true,
		Details:  map[string]string{"languages": strings.Join(names, ",")},
	}, nil
}

// Collect dispatches to language-specific collectors based on auto-detection.
func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
		Items:            []models.CollectedItem{},
		Errors:           []models.CollectError{},
	}

	langs := DetectLanguages()

	// If an explicit language is set in Extra, filter to that language only.
	if cfg.Extra != nil {
		if forced, ok := cfg.Extra["language"]; ok && forced != "" {
			langs = filterLanguages(langs, forced)
		}
	}

	if len(langs) == 0 {
		result.Status = models.StatusSkipped
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrEnvNotDetected,
			Message: "no supported runtime detected (java/dotnet/nodejs/python/go)",
		})
		result.Duration = time.Since(start)
		return result, nil
	}

	for _, lang := range langs {
		switch lang.Language {
		case "java":
			collectJava(ctx, lang, cfg, result)
		case "dotnet":
			collectDotnet(ctx, lang, cfg, result)
		case "nodejs":
			collectNodejs(ctx, lang, cfg, result)
		case "python":
			collectPython(ctx, lang, cfg, result)
		case "go":
			collectGoRuntime(ctx, lang, cfg, result)
		}
	}

	if len(result.Items) == 0 && len(result.Errors) > 0 {
		result.Status = models.StatusFailed
	} else if len(result.Errors) > 0 {
		result.Status = models.StatusPartial
	}

	result.Duration = time.Since(start)
	return result, nil
}

// DetectLanguages inspects running processes (platform-specific) to identify runtimes.
func DetectLanguages() []DetectedLanguage {
	if runtime.GOOS == "windows" {
		return detectLanguagesWindows()
	}
	return detectLanguagesUnix()
}

// detectLanguagesUnix uses /proc scanning and process listing.
func detectLanguagesUnix() []DetectedLanguage {
	var results []DetectedLanguage

	// Use 'ps aux' to list processes.
	out, err := exec.Command("ps", "aux").Output()
	if err != nil {
		return results
	}
	lines := strings.Split(string(out), "\n")

	seen := map[string]bool{}
	for _, line := range lines {
		lower := strings.ToLower(line)
		switch {
		case !seen["java"] && (strings.Contains(lower, " java ") || strings.Contains(lower, "/java ") || strings.Contains(lower, "java -jar")):
			detail := "java"
			if strings.Contains(lower, "tomcat") {
				detail = "tomcat"
			} else if strings.Contains(lower, "spring") {
				detail = "spring-boot"
			} else if strings.Contains(lower, "jboss") || strings.Contains(lower, "wildfly") {
				detail = "jboss"
			}
			results = append(results, DetectedLanguage{Language: "java", Detail: detail})
			seen["java"] = true

		case !seen["dotnet"] && (strings.Contains(lower, "dotnet") || strings.Contains(lower, "aspnetcore")):
			results = append(results, DetectedLanguage{Language: "dotnet", Detail: "aspnetcore"})
			seen["dotnet"] = true

		case !seen["nodejs"] && (strings.Contains(lower, " node ") || strings.Contains(lower, "node.js") || strings.Contains(lower, "/node ")):
			results = append(results, DetectedLanguage{Language: "nodejs", Detail: "nodejs"})
			seen["nodejs"] = true

		case !seen["python"] && (strings.Contains(lower, "python") || strings.Contains(lower, "gunicorn") || strings.Contains(lower, "uvicorn")):
			detail := "python"
			if strings.Contains(lower, "gunicorn") {
				detail = "gunicorn"
			} else if strings.Contains(lower, "uvicorn") {
				detail = "uvicorn"
			}
			results = append(results, DetectedLanguage{Language: "python", Detail: detail})
			seen["python"] = true
		}
	}

	// Always add Go self-detection.
	if !seen["go"] {
		results = append(results, DetectedLanguage{Language: "go", Detail: "self"})
	}

	return results
}

// detectLanguagesWindows uses tasklist to detect runtimes on Windows.
func detectLanguagesWindows() []DetectedLanguage {
	var results []DetectedLanguage

	out, err := exec.Command("tasklist", "/FO", "CSV", "/NH").Output()
	if err != nil {
		// Fall back to Go self-detection only.
		results = append(results, DetectedLanguage{Language: "go", Detail: "self"})
		return results
	}

	lower := strings.ToLower(string(out))
	seen := map[string]bool{}

	if !seen["java"] && strings.Contains(lower, "java") {
		results = append(results, DetectedLanguage{Language: "java", Detail: "java"})
		seen["java"] = true
	}
	if !seen["dotnet"] && (strings.Contains(lower, "dotnet") || strings.Contains(lower, "w3wp")) {
		results = append(results, DetectedLanguage{Language: "dotnet", Detail: "aspnetcore"})
		seen["dotnet"] = true
	}
	if !seen["nodejs"] && strings.Contains(lower, "node.exe") {
		results = append(results, DetectedLanguage{Language: "nodejs", Detail: "nodejs"})
		seen["nodejs"] = true
	}
	if !seen["python"] && (strings.Contains(lower, "python") || strings.Contains(lower, "gunicorn")) {
		results = append(results, DetectedLanguage{Language: "python", Detail: "python"})
		seen["python"] = true
	}
	if !seen["go"] {
		results = append(results, DetectedLanguage{Language: "go", Detail: "self"})
	}

	return results
}

func filterLanguages(langs []DetectedLanguage, only string) []DetectedLanguage {
	var out []DetectedLanguage
	for _, l := range langs {
		if l.Language == only {
			out = append(out, l)
		}
	}
	return out
}
