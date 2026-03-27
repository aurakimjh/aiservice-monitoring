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
	"strconv"
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

// queryPromScalar executes a Prometheus instant query and returns the first scalar value.
func queryPromScalar(query string) float64 {
	url := fmt.Sprintf("%s/api/v1/query?query=%s", prometheusURL, query)
	resp, err := proxyClient.Get(url)
	if err != nil {
		return 0
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Value []json.RawMessage `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.Status != "success" {
		return 0
	}
	if len(result.Data.Result) == 0 || len(result.Data.Result[0].Value) < 2 {
		return 0
	}
	var valStr string
	if err := json.Unmarshal(result.Data.Result[0].Value[1], &valStr); err != nil {
		return 0
	}
	val, _ := strconv.ParseFloat(valStr, 64)
	if val != val { // NaN check
		return 0
	}
	return val
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
			"os_metrics":     a.OSMetrics,
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
				if serverStore != nil {
					serverStore.SetAgentApproved(id, true)
				}
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

	// GET /api/v1/realdata/services — Jaeger 서비스 + Prometheus 메트릭 결합
	mux.HandleFunc("GET /api/v1/realdata/services", func(w http.ResponseWriter, r *http.Request) {
		// 1. Get services from Jaeger
		resp, err := proxyClient.Get(jaegerURL + "/api/services")
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "total": 0, "source": "live"})
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var jaegerResp struct {
			Data []string `json:"data"`
		}
		_ = json.Unmarshal(body, &jaegerResp)

		// 2. For each service, query Prometheus for metrics
		services := make([]map[string]interface{}, 0)
		for _, svcName := range jaegerResp.Data {
			if svcName == "jaeger-all-in-one" {
				continue // skip Jaeger itself
			}
			svc := map[string]interface{}{
				"id":          svcName,
				"name":        svcName,
				"framework":   "-",
				"language":    "-",
				"status":      "healthy",
				"latency_p50": 0.0,
				"latency_p95": 0.0,
				"latency_p99": 0.0,
				"rpm":         0.0,
				"error_rate":  0.0,
			}

			// RPM: sum(rate(demo_http_server_duration_milliseconds_count{exported_job="svc"}[5m])) * 60
			rpmQ := fmt.Sprintf(`sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s"}[5m]))*60`, svcName)
			if val := queryPromScalar(rpmQ); val > 0 {
				svc["rpm"] = val
			}

			// P95 latency
			p95Q := fmt.Sprintf(`histogram_quantile(0.95,sum(rate(demo_http_server_duration_milliseconds_bucket{exported_job="%s"}[5m]))by(le))`, svcName)
			if val := queryPromScalar(p95Q); val > 0 {
				svc["latency_p95"] = val
			}

			// P50 latency
			p50Q := fmt.Sprintf(`histogram_quantile(0.50,sum(rate(demo_http_server_duration_milliseconds_bucket{exported_job="%s"}[5m]))by(le))`, svcName)
			if val := queryPromScalar(p50Q); val > 0 {
				svc["latency_p50"] = val
			}

			// Error rate: errors / total * 100
			errQ := fmt.Sprintf(`sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s",http_status_code=~"5.."}[5m]))/sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s"}[5m]))*100`, svcName, svcName)
			if val := queryPromScalar(errQ); val >= 0 {
				svc["error_rate"] = val
			}

			// Determine status from P95 and error rate
			if p95, ok := svc["latency_p95"].(float64); ok && p95 > 2000 {
				svc["status"] = "warning"
			}
			if errRate, ok := svc["error_rate"].(float64); ok && errRate > 5 {
				svc["status"] = "critical"
			}

			services = append(services, svc)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items":  services,
			"total":  len(services),
			"source": "live",
		})
	})

	// ── Service Auto-Discovery + CRUD ─────────────────────────────

	// syncServicesFromJaeger discovers services from Jaeger and upserts into SQLite.
	syncServicesFromJaeger := func() {
		if serverStore == nil {
			return
		}
		resp, err := proxyClient.Get(jaegerURL + "/api/services")
		if err != nil {
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var jaegerResp struct {
			Data []string `json:"data"`
		}
		json.Unmarshal(body, &jaegerResp)

		for _, svcName := range jaegerResp.Data {
			if svcName == "jaeger-all-in-one" {
				continue
			}
			svc := &ServiceRecord{
				Name:          svcName,
				DiscoveredVia: "jaeger",
				Type:          "api",
			}
			serverStore.UpsertService(svc)
		}
	}

	// Run initial sync
	go syncServicesFromJaeger()

	// GET /api/v1/services — 서비스 목록 (auto-discovered + manual, Prometheus 메트릭 포함)
	mux.HandleFunc("GET /api/v1/services", func(w http.ResponseWriter, r *http.Request) {
		// Sync from Jaeger on each request (lightweight)
		go syncServicesFromJaeger()

		projectID := r.URL.Query().Get("project_id")
		var services []ServiceRecord
		if serverStore != nil {
			services, _ = serverStore.ListServices(projectID)
		}
		if services == nil {
			services = []ServiceRecord{}
		}

		// Enrich with Prometheus metrics
		items := make([]map[string]interface{}, 0, len(services))
		for _, svc := range services {
			item := map[string]interface{}{
				"id":               svc.ID,
				"name":             svc.Name,
				"project_id":       svc.ProjectID,
				"service_group_id": svc.ServiceGroupID,
				"type":             svc.Type,
				"framework":        svc.Framework,
				"language":         svc.Language,
				"owner":            svc.Owner,
				"discovered_via":   svc.DiscoveredVia,
				"host_ids":         svc.HostIDs,
				"status":           "healthy",
				"latency_p50":      0.0,
				"latency_p95":      0.0,
				"rpm":              0.0,
				"error_rate":       0.0,
			}

			// Query Prometheus for this service
			rpmQ := fmt.Sprintf(`sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s"}[5m]))*60`, svc.Name)
			if val := queryPromScalar(rpmQ); val > 0 {
				item["rpm"] = val
			}
			p95Q := fmt.Sprintf(`histogram_quantile(0.95,sum(rate(demo_http_server_duration_milliseconds_bucket{exported_job="%s"}[5m]))by(le))`, svc.Name)
			if val := queryPromScalar(p95Q); val > 0 {
				item["latency_p95"] = val
			}
			p50Q := fmt.Sprintf(`histogram_quantile(0.50,sum(rate(demo_http_server_duration_milliseconds_bucket{exported_job="%s"}[5m]))by(le))`, svc.Name)
			if val := queryPromScalar(p50Q); val > 0 {
				item["latency_p50"] = val
			}
			errQ := fmt.Sprintf(`sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s",http_status_code=~"5.."}[5m]))/sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s"}[5m]))*100`, svc.Name, svc.Name)
			if val := queryPromScalar(errQ); val > 0 {
				item["error_rate"] = val
			}

			items = append(items, item)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items":  items,
			"total":  len(items),
			"source": "live",
		})
	})

	// POST /api/v1/services — 수동 서비스 등록
	mux.HandleFunc("POST /api/v1/services", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"})
			return
		}
		var body ServiceRecord
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
			return
		}
		body.DiscoveredVia = "manual"
		if err := serverStore.UpsertService(&body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, body)
	})

	// GET /api/v1/services/{id} — 서비스 상세
	mux.HandleFunc("GET /api/v1/services/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/services/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		svc, err := serverStore.GetService(id)
		if err != nil || svc == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "service not found"})
			return
		}
		writeJSON(w, http.StatusOK, svc)
	})

	// PUT /api/v1/services/{id} — 서비스 메타데이터 수정
	mux.HandleFunc("PUT /api/v1/services/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/services/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if err := serverStore.UpdateService(id, body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	})

	// ── Project CRUD ──────────────────────────────────────────────

	// POST /api/v1/projects — 프로젝트 생성
	mux.HandleFunc("POST /api/v1/projects", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"})
			return
		}
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Environment string `json:"environment"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
			return
		}
		if body.Environment == "" {
			body.Environment = "production"
		}
		p := &Project{Name: body.Name, Description: body.Description, Environment: body.Environment}
		if err := serverStore.CreateProject(p); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, p)
	})

	// GET /api/v1/projects — 프로젝트 목록
	mux.HandleFunc("GET /api/v1/projects", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "total": 0})
			return
		}
		projects, err := serverStore.ListProjects()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if projects == nil {
			projects = []Project{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": projects, "total": len(projects)})
	})

	// GET /api/v1/projects/{id} — 프로젝트 상세
	mux.HandleFunc("GET /api/v1/projects/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/projects/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		p, err := serverStore.GetProject(id)
		if err != nil || p == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
			return
		}
		writeJSON(w, http.StatusOK, p)
	})

	// PUT /api/v1/projects/{id} — 프로젝트 수정
	mux.HandleFunc("PUT /api/v1/projects/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/projects/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Environment string `json:"environment"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		if err := serverStore.UpdateProject(id, body.Name, body.Description, body.Environment); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	})

	// DELETE /api/v1/projects/{id} — 프로젝트 삭제
	mux.HandleFunc("DELETE /api/v1/projects/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/projects/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		if err := serverStore.DeleteProject(id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// POST /api/v1/projects/{id}/hosts — 호스트를 프로젝트에 할당
	mux.HandleFunc("POST /api/v1/projects/{projectId}/hosts", func(w http.ResponseWriter, r *http.Request) {
		projectID := r.PathValue("projectId")
		var body struct {
			AgentIDs []string `json:"agent_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}
		assigned := 0
		for _, agentID := range body.AgentIDs {
			if serverStore != nil {
				serverStore.SetAgentProject(agentID, projectID)
			}
			assigned++
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"assigned": assigned})
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
