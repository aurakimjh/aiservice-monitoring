package profiler

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"


)

// ── Go profiling types ──────────────────────────────────────────────────────

// GoProfileData holds profile data from a Go pprof endpoint.
type GoProfileData struct {
	ProfileType  string              `json:"profile_type"` // cpu, heap, goroutine
	Format       string              `json:"format"`       // pprof
	SizeBytes    int                 `json:"size_bytes"`
	TopFunctions []GoFunctionProfile `json:"top_functions,omitempty"`
}

// GoFunctionProfile represents a single function from Go pprof output.
type GoFunctionProfile struct {
	Function string  `json:"function"`
	FileLine string  `json:"file_line"`
	Flat     int64   `json:"flat"`      // self samples
	FlatPct  float64 `json:"flat_pct"`
	Cum      int64   `json:"cum"`       // cumulative samples
	CumPct   float64 `json:"cum_pct"`
}

// GoBatchProfileResult wraps the Go profile data.
type GoBatchProfileResult struct {
	Endpoint string         `json:"endpoint"`
	Profile  *GoProfileData `json:"profile"`
}

// ── Go batch profiling functions ────────────────────────────────────────────

// profileGoCPU collects a CPU profile from a Go batch process via pprof HTTP.
func profileGoCPU(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	endpoint := detectGoPprofEndpoint(exec.PID)
	if endpoint == "" {
		return makeErrorResult(exec, "method", fmt.Errorf("no pprof endpoint found for Go process pid=%d", exec.PID))
	}

	data, err := collectGoPprofProfile(ctx, endpoint, "profile", cfg.Duration)
	if err != nil {
		return makeResult(exec, "method", nil, start, err)
	}

	result := &GoBatchProfileResult{
		Endpoint: endpoint,
		Profile:  data,
	}
	return makeResult(exec, "method", result, start, nil)
}

// profileGoHeap collects a heap profile from a Go batch process.
func profileGoHeap(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	endpoint := detectGoPprofEndpoint(exec.PID)
	if endpoint == "" {
		return makeErrorResult(exec, "stack", fmt.Errorf("no pprof endpoint found for Go process pid=%d", exec.PID))
	}

	data, err := collectGoPprofProfile(ctx, endpoint, "heap", 0)
	if err != nil {
		return makeResult(exec, "stack", nil, start, err)
	}

	result := &GoBatchProfileResult{
		Endpoint: endpoint,
		Profile:  data,
	}
	return makeResult(exec, "stack", result, start, nil)
}

// profileGoGoroutines collects a goroutine dump from a Go batch process.
func profileGoGoroutines(ctx context.Context, exec *BatchTarget, cfg BatchProfileConfig) BatchProfileResult {
	start := time.Now()

	endpoint := detectGoPprofEndpoint(exec.PID)
	if endpoint == "" {
		return makeErrorResult(exec, "stack", fmt.Errorf("no pprof endpoint found for Go process pid=%d", exec.PID))
	}

	data, err := collectGoPprofProfile(ctx, endpoint, "goroutine", 0)
	if err != nil {
		return makeResult(exec, "stack", nil, start, err)
	}

	result := &GoBatchProfileResult{
		Endpoint: endpoint,
		Profile:  data,
	}
	return makeResult(exec, "stack", result, start, nil)
}

// detectGoPprofEndpoint attempts to find a pprof HTTP endpoint for a Go
// process by probing common ports.
func detectGoPprofEndpoint(pid int) string {
	// Common pprof ports
	ports := []int{6060, 8080, 9090, 8081, 9091}

	for _, port := range ports {
		addr := fmt.Sprintf("localhost:%d", port)
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err != nil {
			continue
		}
		conn.Close()

		// Verify it's actually a pprof endpoint
		endpoint := fmt.Sprintf("http://%s/debug/pprof", addr)
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get(endpoint + "/")
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return endpoint
		}
	}

	return ""
}

// collectGoPprofProfile fetches a profile from a Go pprof endpoint.
func collectGoPprofProfile(ctx context.Context, endpoint string, profileType string, durationSec int) (*GoProfileData, error) {
	var url string
	switch profileType {
	case "profile":
		seconds := durationSec
		if seconds <= 0 {
			seconds = 30
		}
		url = fmt.Sprintf("%s/profile?seconds=%d", endpoint, seconds)
	case "heap":
		url = fmt.Sprintf("%s/heap", endpoint)
	case "goroutine":
		url = fmt.Sprintf("%s/goroutine?debug=2", endpoint)
	case "mutex":
		url = fmt.Sprintf("%s/mutex", endpoint)
	case "block":
		url = fmt.Sprintf("%s/block", endpoint)
	default:
		url = fmt.Sprintf("%s/%s", endpoint, profileType)
	}

	timeout := time.Duration(durationSec+15) * time.Second
	if timeout < 15*time.Second {
		timeout = 15 * time.Second
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create pprof request: %w", err)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch pprof from %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pprof returned status %d from %s", resp.StatusCode, url)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20)) // 50MB limit
	if err != nil {
		return nil, fmt.Errorf("read pprof response: %w", err)
	}

	result := &GoProfileData{
		ProfileType: profileType,
		Format:      "pprof",
		SizeBytes:   len(data),
	}

	// For goroutine dumps in text mode, parse top functions
	if profileType == "goroutine" {
		result.Format = "text"
		result.TopFunctions = parseGoroutineDump(string(data))
	}

	return result, nil
}

// parseGoroutineDump extracts function counts from a goroutine dump.
func parseGoroutineDump(dump string) []GoFunctionProfile {
	funcCounts := make(map[string]int64)
	lines := strings.Split(dump, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Goroutine dump lines look like:
		// goroutine 1 [running]:
		// main.handler(...)
		//     /app/main.go:42 +0x123
		if strings.HasSuffix(line, ")") || strings.HasSuffix(line, "...)") {
			// This is a function call line
			funcName := line
			if idx := strings.Index(funcName, "("); idx > 0 {
				funcName = funcName[:idx]
			}
			funcCounts[funcName]++
		}
	}

	var total int64
	for _, c := range funcCounts {
		total += c
	}

	var profiles []GoFunctionProfile
	for fn, count := range funcCounts {
		pct := 0.0
		if total > 0 {
			pct = float64(count) / float64(total) * 100.0
		}
		profiles = append(profiles, GoFunctionProfile{
			Function: fn,
			Flat:     count,
			FlatPct:  pct,
			Cum:      count,
			CumPct:   pct,
		})
	}

	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].Flat > profiles[j].Flat
	})

	// Return top 20
	if len(profiles) > 20 {
		profiles = profiles[:20]
	}

	return profiles
}

// parseGoTopFunctions parses "go tool pprof -top" style output.
func parseGoTopFunctions(output string, topN int) []GoFunctionProfile {
	var profiles []GoFunctionProfile
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		// Format: flat flat% sum% cum cum% function
		flat, err := strconv.ParseInt(fields[0], 10, 64)
		if err != nil {
			continue
		}
		flatPctStr := strings.TrimSuffix(fields[1], "%")
		flatPct, _ := strconv.ParseFloat(flatPctStr, 64)

		cum, _ := strconv.ParseInt(fields[3], 10, 64)
		cumPctStr := strings.TrimSuffix(fields[4], "%")
		cumPct, _ := strconv.ParseFloat(cumPctStr, 64)

		funcName := ""
		if len(fields) >= 6 {
			funcName = fields[5]
		}

		profiles = append(profiles, GoFunctionProfile{
			Function: funcName,
			Flat:     flat,
			FlatPct:  flatPct,
			Cum:      cum,
			CumPct:   cumPct,
		})
	}

	if topN > 0 && len(profiles) > topN {
		profiles = profiles[:topN]
	}

	return profiles
}
