package main

// proxy_api.go — Phase 41-3: 실데이터 프록시 API
//
// Collection Server가 Prometheus와 Jaeger를 프록시하여
// Frontend가 단일 엔드포인트(Collection Server)만 호출하면 되도록 합니다.
//
// 환경변수:
//   AITOP_PROMETHEUS_URL  (기본: http://localhost:9090)
//   AITOP_JAEGER_URL      (기본: http://localhost:16686)
//
// Endpoints:
//   ── Prometheus 프록시 ──
//   GET  /api/v1/proxy/prometheus/query         → Prometheus /api/v1/query
//   GET  /api/v1/proxy/prometheus/query_range   → Prometheus /api/v1/query_range
//   GET  /api/v1/proxy/prometheus/labels        → Prometheus /api/v1/labels
//   GET  /api/v1/proxy/prometheus/label/*/values → Prometheus /api/v1/label/*/values
//   GET  /api/v1/proxy/prometheus/series        → Prometheus /api/v1/series
//
//   ── Jaeger 프록시 ──
//   GET  /api/v1/proxy/jaeger/services          → Jaeger /api/services
//   GET  /api/v1/proxy/jaeger/traces            → Jaeger /api/traces?service=...
//   GET  /api/v1/proxy/jaeger/traces/{traceId}  → Jaeger /api/traces/{traceId}
//   GET  /api/v1/proxy/jaeger/dependencies      → Jaeger /api/dependencies
//
//   ── 실데이터 집계 ──
//   GET  /api/v1/realdata/overview              → 홈 대시보드 KPI (Prometheus 쿼리 집계)
//   GET  /api/v1/realdata/hosts                 → Agent 수집 데이터 기반 호스트 목록
//   GET  /api/v1/realdata/hosts/{id}/metrics    → 특정 호스트의 시계열 메트릭

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	prometheusURL string
	jaegerURL     string
	proxyClient   = &http.Client{Timeout: 15 * time.Second}
)

func initProxyConfig() {
	prometheusURL = envOrDefault("AITOP_PROMETHEUS_URL", "http://localhost:9090")
	jaegerURL = envOrDefault("AITOP_JAEGER_URL", "http://localhost:16686")
}

// proxyRequest forwards a request to an upstream and copies the response back.
func proxyRequest(w http.ResponseWriter, r *http.Request, upstreamURL string) {
	req, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"proxy build request: %s"}`, err), http.StatusBadGateway)
		return
	}
	// Copy query parameters
	req.URL.RawQuery = r.URL.RawQuery

	resp, err := proxyClient.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"proxy upstream unreachable: %s","upstream":"%s"}`, err, upstreamURL), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("X-Proxy-Upstream", upstreamURL)
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func registerProxyRoutes(mux *http.ServeMux, f *fleet) {
	initProxyConfig()

	// ═══════════════════════════════════════════════════════════════════════
	// Prometheus 프록시
	// ═══════════════════════════════════════════════════════════════════════

	// GET /api/v1/proxy/prometheus/query — 즉시 쿼리
	mux.HandleFunc("GET /api/v1/proxy/prometheus/query", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, prometheusURL+"/api/v1/query")
	})

	// GET /api/v1/proxy/prometheus/query_range — 범위 쿼리
	mux.HandleFunc("GET /api/v1/proxy/prometheus/query_range", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, prometheusURL+"/api/v1/query_range")
	})

	// GET /api/v1/proxy/prometheus/labels — 레이블 목록
	mux.HandleFunc("GET /api/v1/proxy/prometheus/labels", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, prometheusURL+"/api/v1/labels")
	})

	// GET /api/v1/proxy/prometheus/label/{name}/values — 특정 레이블 값 목록
	mux.HandleFunc("GET /api/v1/proxy/prometheus/label/", func(w http.ResponseWriter, r *http.Request) {
		// /api/v1/proxy/prometheus/label/__name__/values → /api/v1/label/__name__/values
		suffix := r.URL.Path[len("/api/v1/proxy/prometheus/label/"):]
		proxyRequest(w, r, prometheusURL+"/api/v1/label/"+suffix)
	})

	// GET /api/v1/proxy/prometheus/series — 시리즈 조회
	mux.HandleFunc("GET /api/v1/proxy/prometheus/series", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, prometheusURL+"/api/v1/series")
	})

	// GET /api/v1/proxy/prometheus/status — Prometheus 상태
	mux.HandleFunc("GET /api/v1/proxy/prometheus/status", func(w http.ResponseWriter, r *http.Request) {
		resp, err := proxyClient.Get(prometheusURL + "/-/healthy")
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status":    "unreachable",
				"url":       prometheusURL,
				"error":     err.Error(),
			})
			return
		}
		resp.Body.Close()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "connected",
			"url":         prometheusURL,
			"http_status": resp.StatusCode,
		})
	})

	// ═══════════════════════════════════════════════════════════════════════
	// Jaeger 프록시
	// ═══════════════════════════════════════════════════════════════════════

	// GET /api/v1/proxy/jaeger/services — 서비스 목록
	mux.HandleFunc("GET /api/v1/proxy/jaeger/services", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, jaegerURL+"/api/services")
	})

	// GET /api/v1/proxy/jaeger/traces — 트레이스 검색
	mux.HandleFunc("GET /api/v1/proxy/jaeger/traces", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, jaegerURL+"/api/traces")
	})

	// GET /api/v1/proxy/jaeger/traces/{traceId} — 트레이스 상세
	mux.HandleFunc("GET /api/v1/proxy/jaeger/traces/", func(w http.ResponseWriter, r *http.Request) {
		traceID := r.URL.Path[len("/api/v1/proxy/jaeger/traces/"):]
		if traceID == "" {
			http.Error(w, `{"error":"traceId required"}`, http.StatusBadRequest)
			return
		}
		proxyRequest(w, r, jaegerURL+"/api/traces/"+traceID)
	})

	// GET /api/v1/proxy/jaeger/dependencies — 서비스 의존성 그래프
	mux.HandleFunc("GET /api/v1/proxy/jaeger/dependencies", func(w http.ResponseWriter, r *http.Request) {
		proxyRequest(w, r, jaegerURL+"/api/dependencies")
	})

	// GET /api/v1/proxy/jaeger/status — Jaeger 상태
	mux.HandleFunc("GET /api/v1/proxy/jaeger/status", func(w http.ResponseWriter, r *http.Request) {
		resp, err := proxyClient.Get(jaegerURL + "/")
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"status": "unreachable",
				"url":    jaegerURL,
				"error":  err.Error(),
			})
			return
		}
		resp.Body.Close()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":      "connected",
			"url":         jaegerURL,
			"http_status": resp.StatusCode,
		})
	})

	// ═══════════════════════════════════════════════════════════════════════
	// 실데이터 집계 API
	// ═══════════════════════════════════════════════════════════════════════

	// GET /api/v1/realdata/overview — 홈 대시보드 KPI (실데이터)
	mux.HandleFunc("GET /api/v1/realdata/overview", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		totalAgents := len(agents)

		// Collect from agents
		var onlineCount, offlineCount int
		var totalCPU, totalMem float64
		for _, a := range agents {
			a.mu.RLock()
			if time.Since(a.LastHeartbeat) < 90*time.Second {
				onlineCount++
			} else {
				offlineCount++
			}
			totalCPU += a.CPUPercent
			totalMem += a.MemoryMB
			a.mu.RUnlock()
		}
		avgCPU := 0.0
		if totalAgents > 0 {
			avgCPU = totalCPU / float64(totalAgents)
		}

		// Prometheus health check
		promStatus := "unreachable"
		if resp, err := proxyClient.Get(prometheusURL + "/-/healthy"); err == nil {
			resp.Body.Close()
			promStatus = "connected"
		}

		// Jaeger health check
		jaegerStatus := "unreachable"
		if resp, err := proxyClient.Get(jaegerURL + "/"); err == nil {
			resp.Body.Close()
			jaegerStatus = "connected"
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"agents": map[string]interface{}{
				"total":   totalAgents,
				"online":  onlineCount,
				"offline": offlineCount,
			},
			"system": map[string]interface{}{
				"avg_cpu_percent": fmt.Sprintf("%.1f", avgCPU),
				"total_memory_mb": fmt.Sprintf("%.0f", totalMem),
			},
			"backends": map[string]interface{}{
				"prometheus": promStatus,
				"jaeger":     jaegerStatus,
				"prometheus_url": prometheusURL,
				"jaeger_url":    jaegerURL,
			},
			"source": "live",
		})
	})

	// GET /api/v1/realdata/hosts — Agent Heartbeat 기반 실시간 호스트 목록
	// agentToMap converts an agentRecord to a JSON-friendly map.
	agentToMap := func(a *agentRecord) map[string]interface{} {
		status := "online"
		if time.Since(a.LastHeartbeat) > 90*time.Second {
			status = "offline"
		}
		return map[string]interface{}{
			"id":             a.ID,
			"hostname":       a.Hostname,
			"os_type":        a.OSType,
			"os_version":     a.OSVersion,
			"agent_version":  a.AgentVersion,
			"status":         status,
			"cpu_percent":    a.CPUPercent,
			"memory_mb":      a.MemoryMB,
			"last_heartbeat": a.LastHeartbeat,
			"registered_at":  a.RegisteredAt,
			"collectors":     a.Plugins,
			"ai_detected":    a.AIDetected,
			"sdk_langs":      a.SDKLangs,
			"approved":       a.Approved,
			"source":         "live",
		}
	}

	// GET /api/v1/realdata/hosts — 승인된(approved) 호스트만 반환
	mux.HandleFunc("GET /api/v1/realdata/hosts", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		hosts := make([]map[string]interface{}, 0)
		for _, a := range agents {
			a.mu.RLock()
			if a.Approved {
				hosts = append(hosts, agentToMap(a))
			}
			a.mu.RUnlock()
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items":  hosts,
			"total":  len(hosts),
			"source": "live",
		})
	})

	// GET /api/v1/realdata/pending-agents — 미승인(pending) Agent 목록
	mux.HandleFunc("GET /api/v1/realdata/pending-agents", func(w http.ResponseWriter, r *http.Request) {
		agents := f.list()
		pending := make([]map[string]interface{}, 0)
		for _, a := range agents {
			a.mu.RLock()
			if !a.Approved {
				pending = append(pending, agentToMap(a))
			}
			a.mu.RUnlock()
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": pending,
			"total": len(pending),
		})
	})

	// POST /api/v1/realdata/approve-agents — Agent 승인 (호스트 등록)
	mux.HandleFunc("POST /api/v1/realdata/approve-agents", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentIDs []string `json:"agent_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}
		approved := 0
		for _, id := range body.AgentIDs {
			if rec, ok := f.get(id); ok {
				rec.mu.Lock()
				rec.Approved = true
				rec.mu.Unlock()
				approved++
			}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"approved": approved,
			"total":    len(body.AgentIDs),
		})
	})

	// GET /api/v1/realdata/hosts/{id}/metrics — 호스트별 시계열 (Prometheus 프록시)
	mux.HandleFunc("GET /api/v1/realdata/hosts/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/realdata/hosts/"):]
		parts := strings.SplitN(path, "/", 2)
		hostID := parts[0]
		subPath := ""
		if len(parts) > 1 {
			subPath = parts[1]
		}

		if subPath == "metrics" {
			// Proxy to Prometheus with agent_id label filter
			q := r.URL.Query()
			query := q.Get("query")
			if query == "" {
				// Default: CPU usage for this agent
				query = fmt.Sprintf(`node_cpu_seconds_total{agent_id="%s"}`, hostID)
			}
			target := fmt.Sprintf("%s/api/v1/query?query=%s", prometheusURL, query)
			proxyRequest(w, r, target)
			return
		}

		// Default: return agent info (lookup by ID or hostname)
		agent, ok := f.get(hostID)
		if !ok {
			// Try lookup by hostname
			for _, a := range f.list() {
				a.mu.RLock()
				if a.Hostname == hostID {
					agent = a
					ok = true
				}
				a.mu.RUnlock()
				if ok { break }
			}
		}
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]interface{}{
				"error": "agent not found",
				"id":    hostID,
			})
			return
		}
		agent.mu.RLock()
		result := agentToMap(agent)
		agent.mu.RUnlock()
		writeJSON(w, http.StatusOK, result)
	})

	// GET /api/v1/realdata/connectivity — 전체 백엔드 연결 상태
	mux.HandleFunc("GET /api/v1/realdata/connectivity", func(w http.ResponseWriter, r *http.Request) {
		checks := make(map[string]interface{})

		// Collection Server itself
		checks["collection_server"] = map[string]interface{}{
			"status": "connected",
			"url":    "self",
		}

		// Prometheus
		if resp, err := proxyClient.Get(prometheusURL + "/-/healthy"); err == nil {
			resp.Body.Close()
			checks["prometheus"] = map[string]interface{}{"status": "connected", "url": prometheusURL}
		} else {
			checks["prometheus"] = map[string]interface{}{"status": "unreachable", "url": prometheusURL, "error": err.Error()}
		}

		// Jaeger
		if resp, err := proxyClient.Get(jaegerURL + "/"); err == nil {
			resp.Body.Close()
			checks["jaeger"] = map[string]interface{}{"status": "connected", "url": jaegerURL}
		} else {
			checks["jaeger"] = map[string]interface{}{"status": "unreachable", "url": jaegerURL, "error": err.Error()}
		}

		// Agent fleet
		agents := f.list()
		onlineCount := 0
		for _, a := range agents {
			a.mu.RLock()
			if time.Since(a.LastHeartbeat) < 90*time.Second {
				onlineCount++
			}
			a.mu.RUnlock()
		}
		checks["agents"] = map[string]interface{}{
			"total":  len(agents),
			"online": onlineCount,
		}

		writeJSON(w, http.StatusOK, checks)
	})
}

// envOrDefault is already defined in main.go but we reference it here.
// No redeclaration needed.
func init() {
	// Ensure AITOP_PROMETHEUS_URL and AITOP_JAEGER_URL are read from env.
	// Actual init is done in initProxyConfig() called from registerProxyRoutes().
	_ = os.Getenv("AITOP_PROMETHEUS_URL")
	_ = os.Getenv("AITOP_JAEGER_URL")
}
