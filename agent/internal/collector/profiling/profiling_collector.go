// Package profiling provides a Collector for continuous CPU/Memory profiling.
// Supports Go (pprof), Python (py-spy/cProfile), and Java (async-profiler/JFR).
package profiling

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// Collector gathers CPU and memory profiles from Go, Python, and Java processes.
type Collector struct{}

// New returns a new Profiling Collector.
func New() *Collector { return &Collector{} }

func (c *Collector) ID() string      { return "profiling" }
func (c *Collector) Version() string { return "1.0.0" }

func (c *Collector) SupportedPlatforms() []string {
	return []string{"linux", "darwin", "windows"}
}

func (c *Collector) RequiredPrivileges() []models.Privilege {
	return []models.Privilege{
		{Type: "read", Target: "/proc/[pid]/cmdline", Description: "detect profiling targets"},
		{Type: "exec", Target: "go tool pprof", Description: "collect Go CPU/memory profiles"},
		{Type: "exec", Target: "py-spy", Description: "collect Python CPU profiles (py-spy, MIT)"},
		{Type: "exec", Target: "asprof", Description: "collect Java profiles (async-profiler, Apache 2.0)"},
		{Type: "exec", Target: "jcmd", Description: "collect Java Flight Recorder profiles"},
	}
}

func (c *Collector) OutputSchemas() []string {
	return []string{
		"profiling.cpu_profile.v1",
		"profiling.memory_profile.v1",
		"profiling.goroutine_profile.v1",
		"profiling.thread_profile.v1",
	}
}

// profilableProcess represents a detected process that can be profiled.
type profilableProcess struct {
	Language string // "go", "python", "java"
	PID      int
	Name     string // service/process name
	Endpoint string // pprof HTTP endpoint for Go
}

func (c *Collector) AutoDetect(ctx context.Context) (models.DetectResult, error) {
	procs := detectProfilableProcesses()
	if len(procs) == 0 {
		return models.DetectResult{Detected: false}, nil
	}

	details := map[string]string{
		"count":    strconv.Itoa(len(procs)),
		"language": procs[0].Language,
		"pid":      strconv.Itoa(procs[0].PID),
	}
	return models.DetectResult{Detected: true, Details: details}, nil
}

func (c *Collector) Collect(ctx context.Context, cfg models.CollectConfig) (*models.CollectResult, error) {
	start := time.Now()
	result := &models.CollectResult{
		CollectorID:      c.ID(),
		CollectorVersion: c.Version(),
		Timestamp:        start.UTC(),
		Status:           models.StatusSuccess,
	}

	procs := detectProfilableProcesses()
	if len(procs) == 0 {
		result.Status = models.StatusSkipped
		result.Errors = append(result.Errors, models.CollectError{
			Code:    models.ErrEnvNotDetected,
			Message: "no profilable processes found",
		})
		result.Duration = time.Since(start)
		return result, nil
	}

	durationSec := 30
	if d, ok := cfg.Extra["duration_sec"]; ok {
		if v, err := strconv.Atoi(d); err == nil && v > 0 && v <= 300 {
			durationSec = v
		}
	}

	profileType := "cpu"
	if pt, ok := cfg.Extra["profile_type"]; ok {
		profileType = pt
	}

	for _, proc := range procs {
		var profileData []byte
		var format string
		var collectErr error

		switch proc.Language {
		case "go":
			profileData, format, collectErr = collectGoProfile(ctx, proc, profileType, durationSec)
		case "python":
			profileData, format, collectErr = collectPythonProfile(ctx, proc, profileType, durationSec)
		case "java":
			profileData, format, collectErr = collectJavaProfile(ctx, proc, profileType, durationSec)
		default:
			continue
		}

		if collectErr != nil {
			result.Errors = append(result.Errors, models.CollectError{
				Code:    models.ErrParseError,
				Message: fmt.Sprintf("profile %s pid=%d: %v", proc.Language, proc.PID, collectErr),
			})
			continue
		}

		if len(profileData) > 0 {
			result.Items = append(result.Items, models.CollectedItem{
				SchemaName:    fmt.Sprintf("profiling.%s_profile.v1", profileType),
				SchemaVersion: "1.0.0",
				MetricType:    "profile",
				Category:      "it",
				Data: map[string]interface{}{
					"language":     proc.Language,
					"pid":          proc.PID,
					"service_name": proc.Name,
					"profile_type": profileType,
					"format":       format,
					"duration_sec": durationSec,
					"size_bytes":   len(profileData),
					"data_base64":  profileData, // binary data
				},
			})
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

// detectProfilableProcesses scans running processes for Go, Python, and Java.
func detectProfilableProcesses() []profilableProcess {
	if runtime.GOOS != "linux" && runtime.GOOS != "darwin" {
		return nil
	}

	var procs []profilableProcess

	entries, err := os.ReadDir("/proc")
	if err != nil {
		return procs
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 1 {
			continue
		}

		cmdlineBytes, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}
		cmdline := string(cmdlineBytes)

		switch {
		case strings.Contains(cmdline, "go") && strings.Contains(cmdline, "pprof"):
			procs = append(procs, profilableProcess{Language: "go", PID: pid, Name: extractServiceName(cmdline, "go")})
		case isGoProcess(cmdline):
			procs = append(procs, profilableProcess{
				Language: "go", PID: pid, Name: extractServiceName(cmdline, "go"),
				Endpoint: detectPprofEndpoint(pid),
			})
		case strings.Contains(cmdline, "python") || strings.Contains(cmdline, "python3"):
			procs = append(procs, profilableProcess{Language: "python", PID: pid, Name: extractServiceName(cmdline, "python")})
		case strings.Contains(cmdline, "java") || strings.Contains(cmdline, "jdk"):
			procs = append(procs, profilableProcess{Language: "java", PID: pid, Name: extractServiceName(cmdline, "java")})
		}
	}

	return procs
}

// isGoProcess detects Go processes by checking for Go-specific characteristics.
func isGoProcess(cmdline string) bool {
	parts := strings.Split(cmdline, "\x00")
	if len(parts) == 0 {
		return false
	}
	exe := parts[0]
	// Check if the binary is a Go executable (heuristic: check for Go runtime symbols)
	if _, err := os.Stat(exe); err == nil {
		// Check if the binary links against Go runtime
		return strings.HasSuffix(exe, ".go") || checkGoRuntime(exe)
	}
	return false
}

// checkGoRuntime checks if a binary is a Go executable.
func checkGoRuntime(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	// Go binaries contain the string "runtime.main"
	return len(data) > 0 && strings.Contains(string(data[:min(len(data), 1<<20)]), "runtime.main")
}

// detectPprofEndpoint tries to find a pprof HTTP endpoint for a Go process.
func detectPprofEndpoint(pid int) string {
	// Default pprof endpoint — check common ports
	ports := []int{6060, 8080, 9090}
	for _, port := range ports {
		endpoint := fmt.Sprintf("http://localhost:%d/debug/pprof", port)
		return endpoint // Return first candidate; actual check happens during collection
	}
	return ""
}

// extractServiceName extracts a human-readable service name from the cmdline.
func extractServiceName(cmdline, language string) string {
	parts := strings.Split(strings.ReplaceAll(cmdline, "\x00", " "), " ")
	if len(parts) == 0 {
		return "unknown"
	}

	exe := parts[0]
	// Get the basename
	for i := len(exe) - 1; i >= 0; i-- {
		if exe[i] == '/' {
			exe = exe[i+1:]
			break
		}
	}

	if exe == "" || exe == language || exe == language+"3" {
		if len(parts) > 1 {
			return parts[1]
		}
		return language + "-service"
	}
	return exe
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
