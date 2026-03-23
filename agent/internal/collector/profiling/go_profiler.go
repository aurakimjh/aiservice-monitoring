package profiling

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// collectGoProfile captures a CPU or memory profile from a Go process via pprof HTTP.
func collectGoProfile(ctx context.Context, proc profilableProcess, profileType string, durationSec int) ([]byte, string, error) {
	if proc.Endpoint == "" {
		proc.Endpoint = "http://localhost:6060/debug/pprof"
	}

	var url string
	switch profileType {
	case "cpu":
		url = fmt.Sprintf("%s/profile?seconds=%d", proc.Endpoint, durationSec)
	case "memory", "alloc":
		url = fmt.Sprintf("%s/heap", proc.Endpoint)
	case "goroutine":
		url = fmt.Sprintf("%s/goroutine?debug=0", proc.Endpoint)
	case "lock":
		url = fmt.Sprintf("%s/mutex", proc.Endpoint)
	default:
		url = fmt.Sprintf("%s/profile?seconds=%d", proc.Endpoint, durationSec)
	}

	timeout := time.Duration(durationSec+10) * time.Second
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", fmt.Errorf("create request: %w", err)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fetch pprof from %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("pprof returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20)) // 50MB limit
	if err != nil {
		return nil, "", fmt.Errorf("read pprof response: %w", err)
	}

	return data, "pprof", nil
}
