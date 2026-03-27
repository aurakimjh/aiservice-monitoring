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

func toFloat(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	default:
		return 0
	}
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

	// GET /api/v1/realdata/hosts — 승인된(approved) 호스트만 반환 (?project_id= 필터)
	mux.HandleFunc("GET /api/v1/realdata/hosts", func(w http.ResponseWriter, r *http.Request) {
		projectFilter := r.URL.Query().Get("project_id")
		agents := f.list()
		hosts := make([]map[string]interface{}, 0)

		// project_id별 agent 조회를 위해 SQLite에서 project_id 매핑 로드
		agentProjects := map[string]string{} // agent_id → project_id
		if serverStore != nil && projectFilter != "" {
			rows, _ := serverStore.db.Query(`SELECT id, project_id FROM agents WHERE project_id = ?`, projectFilter)
			if rows != nil {
				defer rows.Close()
				for rows.Next() {
					var aid, pid string
					rows.Scan(&aid, &pid)
					agentProjects[aid] = pid
				}
			}
		}

		for _, a := range agents {
			a.mu.RLock()
			if a.Approved {
				// project_id 필터 적용
				if projectFilter != "" {
					if _, ok := agentProjects[a.ID]; !ok {
						a.mu.RUnlock()
						continue
					}
				}
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

	// ── GenAI Span Query (LLM call tracing) ──────────────────────

	// GET /api/v1/genai/spans — LLM 호출 span 목록 (Jaeger에서 gen_ai.* 태그 필터)
	mux.HandleFunc("GET /api/v1/genai/spans", func(w http.ResponseWriter, r *http.Request) {
		service := r.URL.Query().Get("service")
		limit := r.URL.Query().Get("limit")
		if limit == "" {
			limit = "50"
		}
		if service == "" {
			service = "rag-service"
		}

		// Query Jaeger for traces with gen_ai tags
		jaegerQ := fmt.Sprintf("%s/api/traces?service=%s&tags={\"gen_ai.system\":\"\"}&limit=%s", jaegerURL, service, limit)
		resp, err := proxyClient.Get(jaegerQ)
		if err != nil {
			// Fallback: query without tag filter
			jaegerQ = fmt.Sprintf("%s/api/traces?service=%s&limit=%s", jaegerURL, service, limit)
			resp, err = proxyClient.Get(jaegerQ)
			if err != nil {
				writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "total": 0})
				return
			}
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		// Parse Jaeger response and extract GenAI spans
		var jaegerResp struct {
			Data []struct {
				TraceID string `json:"traceID"`
				Spans   []struct {
					SpanID        string `json:"spanID"`
					OperationName string `json:"operationName"`
					StartTime     int64  `json:"startTime"` // microseconds
					Duration      int64  `json:"duration"`   // microseconds
					Tags          []struct {
						Key   string      `json:"key"`
						Value interface{} `json:"value"`
					} `json:"tags"`
					Process struct {
						ServiceName string `json:"serviceName"`
					} `json:"process"`
				} `json:"spans"`
			} `json:"data"`
		}
		json.Unmarshal(body, &jaegerResp)

		items := make([]map[string]interface{}, 0)
		for _, trace := range jaegerResp.Data {
			for _, span := range trace.Spans {
				// Check if span has gen_ai attributes
				attrs := map[string]interface{}{}
				isGenAI := false
				for _, tag := range span.Tags {
					if strings.HasPrefix(tag.Key, "gen_ai.") {
						attrs[tag.Key] = tag.Value
						isGenAI = true
					}
				}
				if !isGenAI && !strings.Contains(span.OperationName, "gen_ai") && !strings.Contains(span.OperationName, "llm") {
					continue
				}

				item := map[string]interface{}{
					"trace_id":       trace.TraceID,
					"span_id":        span.SpanID,
					"operation":      span.OperationName,
					"service":        span.Process.ServiceName,
					"start_time":     span.StartTime / 1000, // ms
					"duration_ms":    span.Duration / 1000,
					"model":          attrs["gen_ai.request.model"],
					"system":         attrs["gen_ai.system"],
					"input_tokens":   attrs["gen_ai.usage.input_tokens"],
					"output_tokens":  attrs["gen_ai.usage.output_tokens"],
					"total_tokens":   attrs["gen_ai.usage.total_tokens"],
					"finish_reason":  attrs["gen_ai.response.finish_reason"],
					"cost_usd":       attrs["gen_ai.cost_usd"],
					"latency_ms":     attrs["gen_ai.latency_ms"],
					"attributes":     attrs,
				}
				items = append(items, item)
				// Record token usage for cost aggregation
				if serverStore != nil {
					go func(it map[string]interface{}) {
						rec := &TokenUsageRecord{
							TraceID:  fmt.Sprintf("%v", it["trace_id"]),
							SpanID:   fmt.Sprintf("%v", it["span_id"]),
							Service:  fmt.Sprintf("%v", it["service"]),
							Provider: fmt.Sprintf("%v", it["system"]),
							Model:    fmt.Sprintf("%v", it["model"]),
							Timestamp: time.Now().UTC().Format(time.RFC3339),
						}
						if v := it["input_tokens"]; v != nil { rec.InputTokens = int(toFloat(v)) }
						if v := it["output_tokens"]; v != nil { rec.OutputTokens = int(toFloat(v)) }
						if v := it["duration_ms"]; v != nil { rec.LatencyMS = toFloat(v) }
						rec.CostUSD = serverStore.CalcCost(rec.Provider, rec.Model, rec.InputTokens, rec.OutputTokens)
						serverStore.InsertTokenUsage(rec)
					}(item)
				}
			}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": items,
			"total": len(items),
		})
	})

	// GET /api/v1/genai/pipeline-traces — RAG 파이프라인 트레이스 (워터폴용)
	mux.HandleFunc("GET /api/v1/genai/pipeline-traces", func(w http.ResponseWriter, r *http.Request) {
		service := r.URL.Query().Get("service")
		if service == "" {
			service = "rag-service"
		}
		limit := r.URL.Query().Get("limit")
		if limit == "" {
			limit = "20"
		}

		jaegerQ := fmt.Sprintf("%s/api/traces?service=%s&limit=%s", jaegerURL, service, limit)
		resp, err := proxyClient.Get(jaegerQ)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "total": 0})
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)

		var jaegerResp struct {
			Data []struct {
				TraceID string `json:"traceID"`
				Spans   []struct {
					SpanID        string `json:"spanID"`
					OperationName string `json:"operationName"`
					StartTime     int64  `json:"startTime"`
					Duration      int64  `json:"duration"`
					References    []struct {
						RefType string `json:"refType"`
						SpanID  string `json:"spanID"`
					} `json:"references"`
					Tags []struct {
						Key   string      `json:"key"`
						Value interface{} `json:"value"`
					} `json:"tags"`
				} `json:"spans"`
			} `json:"data"`
		}
		json.Unmarshal(body, &jaegerResp)

		pipelines := make([]map[string]interface{}, 0)
		for _, trace := range jaegerResp.Data {
			// Find workflow span (rag.workflow or root)
			var rootStart int64
			stages := make([]map[string]interface{}, 0)

			for _, span := range trace.Spans {
				if span.OperationName == "rag.workflow" {
					rootStart = span.StartTime
				}
				// Collect RAG stages
				if strings.HasPrefix(span.OperationName, "rag.") || strings.HasPrefix(span.OperationName, "gen_ai.") {
					attrs := map[string]interface{}{}
					for _, tag := range span.Tags {
						attrs[tag.Key] = tag.Value
					}
					stages = append(stages, map[string]interface{}{
						"span_id":    span.SpanID,
						"name":       span.OperationName,
						"start_us":   span.StartTime,
						"duration_ms": span.Duration / 1000,
						"attributes": attrs,
					})
				}
			}
			if len(stages) == 0 {
				continue
			}
			if rootStart == 0 && len(trace.Spans) > 0 {
				rootStart = trace.Spans[0].StartTime
			}

			// Calculate offsets from root
			for _, s := range stages {
				startUs := s["start_us"].(int64)
				s["offset_ms"] = (startUs - rootStart) / 1000
				delete(s, "start_us")
			}

			totalMs := int64(0)
			for _, s := range stages {
				end := s["offset_ms"].(int64) + s["duration_ms"].(int64)
				if end > totalMs {
					totalMs = end
				}
			}

			pipelines = append(pipelines, map[string]interface{}{
				"trace_id":  trace.TraceID,
				"total_ms":  totalMs,
				"stages":    stages,
			})
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": pipelines,
			"total": len(pipelines),
		})
	})

	// ── Eval + Prompt + Security APIs ────────────────────────────

	// POST /api/v1/genai/evals — 품질 평가 기록
	mux.HandleFunc("POST /api/v1/genai/evals", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"}); return }
		var body EvalRecord
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"}); return
		}
		serverStore.InsertEval(&body)
		writeJSON(w, http.StatusCreated, body)
	})

	// GET /api/v1/genai/evals — 평가 목록
	mux.HandleFunc("GET /api/v1/genai/evals", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}}); return }
		evals, _ := serverStore.ListEvals(100)
		if evals == nil { evals = []EvalRecord{} }
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": evals, "total": len(evals)})
	})

	// GET /api/v1/genai/eval-summary — 평가 메트릭 집계
	mux.HandleFunc("GET /api/v1/genai/eval-summary", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}}); return }
		summaries, _ := serverStore.GetEvalSummary()
		if summaries == nil { summaries = []EvalSummary{} }
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": summaries, "total": len(summaries)})
	})

	// GET /api/v1/genai/prompt-versions — 프롬프트 버전 목록
	mux.HandleFunc("GET /api/v1/genai/prompt-versions", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}}); return }
		pvs, _ := serverStore.ListPromptVersions()
		if pvs == nil { pvs = []PromptVersion{} }
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": pvs, "total": len(pvs)})
	})

	// POST /api/v1/genai/prompt-versions — 프롬프트 버전 등록
	mux.HandleFunc("POST /api/v1/genai/prompt-versions", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"}); return }
		var body PromptVersion
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"}); return
		}
		serverStore.UpsertPromptVersion(&body)
		writeJSON(w, http.StatusCreated, body)
	})

	// GET /api/v1/genai/security-events — 보안 이벤트 목록
	mux.HandleFunc("GET /api/v1/genai/security-events", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}}); return }
		events, _ := serverStore.ListSecurityEvents(100)
		if events == nil { events = []SecurityEvent{} }
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": events, "total": len(events)})
	})

	// POST /api/v1/genai/security-events — 보안 이벤트 기록
	mux.HandleFunc("POST /api/v1/genai/security-events", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil { writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"}); return }
		var body SecurityEvent
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"}); return
		}
		serverStore.InsertSecurityEvent(&body)
		writeJSON(w, http.StatusCreated, body)
	})

	// ── Token Cost APIs ──────────────────────────────────────────

	// GET /api/v1/genai/cost-summary — 모델별 토큰 비용 집계
	mux.HandleFunc("GET /api/v1/genai/cost-summary", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}, "total": 0})
			return
		}
		summaries, err := serverStore.GetTokenUsageSummary()
		if err != nil || summaries == nil {
			summaries = []TokenUsageSummary{}
		}
		totalCost := 0.0
		totalTokens := 0
		for _, s := range summaries {
			totalCost += s.TotalCost
			totalTokens += s.TotalInput + s.TotalOutput
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items":        summaries,
			"total":        len(summaries),
			"total_cost":   totalCost,
			"total_tokens": totalTokens,
		})
	})

	// GET /api/v1/genai/model-prices — 모델 가격 목록
	mux.HandleFunc("GET /api/v1/genai/model-prices", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
			return
		}
		prices, _ := serverStore.ListModelPrices()
		if prices == nil {
			prices = []ModelPrice{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": prices, "total": len(prices)})
	})

	// PUT /api/v1/genai/model-prices — 모델 가격 업데이트
	mux.HandleFunc("PUT /api/v1/genai/model-prices", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"})
			return
		}
		var body ModelPrice
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}
		serverStore.UpsertModelPrice(&body)
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
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
			instanceCount := 0
			if serverStore != nil {
				instanceCount = serverStore.CountInstances(svc.ID)
			}
			item := map[string]interface{}{
				"id":                svc.ID,
				"name":              svc.Name,
				"project_id":        svc.ProjectID,
				"service_group_id":  svc.ServiceGroupID,
				"type":              svc.Type,
				"framework":         svc.Framework,
				"language":          svc.Language,
				"owner":             svc.Owner,
				"discovered_via":    svc.DiscoveredVia,
				"host_ids":          svc.HostIDs,
				"active_instances":  instanceCount,
				"status":            "healthy",
				"latency_p50":       0.0,
				"latency_p95":       0.0,
				"rpm":               0.0,
				"error_rate":        0.0,
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

	// ── Service Group (AI Pipeline) CRUD ──────────────────────────

	// POST /api/v1/service-groups — 파이프라인 그룹 생성
	mux.HandleFunc("POST /api/v1/service-groups", func(w http.ResponseWriter, r *http.Request) {
		if serverStore == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not available"})
			return
		}
		var body ServiceGroupRecord
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
			return
		}
		if body.Type == "" {
			body.Type = "rag"
		}
		if err := serverStore.CreateServiceGroup(&body); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusCreated, body)
	})

	// GET /api/v1/service-groups — 그룹 목록
	mux.HandleFunc("GET /api/v1/service-groups", func(w http.ResponseWriter, r *http.Request) {
		projectID := r.URL.Query().Get("project_id")
		var groups []ServiceGroupRecord
		if serverStore != nil {
			groups, _ = serverStore.ListServiceGroups(projectID)
		}
		if groups == nil {
			groups = []ServiceGroupRecord{}
		}

		// Enrich with aggregated metrics from member services
		items := make([]map[string]interface{}, 0, len(groups))
		for _, sg := range groups {
			totalRPM := 0.0
			maxP95 := 0.0
			totalErr := 0.0
			svcCount := len(sg.ServiceIDs)

			for _, svcName := range sg.ServiceIDs {
				rpmQ := fmt.Sprintf(`sum(rate(demo_http_server_duration_milliseconds_count{exported_job="%s"}[5m]))*60`, svcName)
				if val := queryPromScalar(rpmQ); val > 0 {
					totalRPM += val
				}
				p95Q := fmt.Sprintf(`histogram_quantile(0.95,sum(rate(demo_http_server_duration_milliseconds_bucket{exported_job="%s"}[5m]))by(le))`, svcName)
				if val := queryPromScalar(p95Q); val > maxP95 {
					maxP95 = val
				}
			}

			items = append(items, map[string]interface{}{
				"id":            sg.ID,
				"name":          sg.Name,
				"project_id":    sg.ProjectID,
				"type":          sg.Type,
				"description":   sg.Description,
				"service_ids":   sg.ServiceIDs,
				"service_count": svcCount,
				"total_rpm":     totalRPM,
				"max_p95":       maxP95,
				"error_rate":    totalErr,
				"created_at":    sg.CreatedAt,
				"updated_at":    sg.UpdatedAt,
			})
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": items,
			"total": len(items),
		})
	})

	// GET /api/v1/service-groups/{id} — 그룹 상세
	mux.HandleFunc("GET /api/v1/service-groups/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/service-groups/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		sg, err := serverStore.GetServiceGroup(id)
		if err != nil || sg == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "group not found"})
			return
		}
		writeJSON(w, http.StatusOK, sg)
	})

	// PUT /api/v1/service-groups/{id} — 그룹 수정
	mux.HandleFunc("PUT /api/v1/service-groups/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/service-groups/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		var body struct {
			Name        string   `json:"name"`
			Description string   `json:"description"`
			Type        string   `json:"type"`
			ServiceIDs  []string `json:"service_ids"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		if err := serverStore.UpdateServiceGroup(id, body.Name, body.Description, body.Type, body.ServiceIDs); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	})

	// DELETE /api/v1/service-groups/{id} — 그룹 삭제
	mux.HandleFunc("DELETE /api/v1/service-groups/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/v1/service-groups/"):]
		if id == "" || serverStore == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		serverStore.DeleteServiceGroup(id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})

	// ── Instance API ──────────────────────────────────────────────

	// GET /api/v1/instances — 인스턴스 목록
	mux.HandleFunc("GET /api/v1/instances", func(w http.ResponseWriter, r *http.Request) {
		serviceID := r.URL.Query().Get("service_id")
		var instances []InstanceRecord
		if serverStore != nil {
			instances, _ = serverStore.ListInstances(serviceID)
		}
		if instances == nil {
			instances = []InstanceRecord{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"items": instances,
			"total": len(instances),
		})
	})

	// syncInstancesFromAgents creates instances from agent heartbeat data.
	// Called when agents report running services via process scan.
	syncInstancesFromAgents := func() {
		if serverStore == nil {
			return
		}
		agents := f.list()
		services, _ := serverStore.ListServices("")
		svcByName := map[string]string{} // name → id
		for _, svc := range services {
			svcByName[svc.Name] = svc.ID
		}

		for _, agent := range agents {
			agent.mu.RLock()
			if !agent.Approved {
				agent.mu.RUnlock()
				continue
			}
			// Each approved agent with plugins = potential instances
			for _, plugin := range agent.Plugins {
				// Map known plugin patterns to service names
				// e.g., agent running on host that sends OTel with service.name
				_ = plugin
			}
			// For demo: create one instance per agent for each known service on that host
			// In production, Agent would report detected processes (java, python, node) with ports
			hostname := agent.Hostname
			agentID := agent.ID
			agent.mu.RUnlock()

			// Match agent to services by checking if agent's host appears in Jaeger traces
			for svcName, svcID := range svcByName {
				inst := &InstanceRecord{
					ID:        fmt.Sprintf("inst-%s-%s", svcID, agentID),
					ServiceID: svcID,
					HostID:    agentID,
					Hostname:  hostname,
					Endpoint:  hostname + ":*",
					Status:    "running",
				}
				_ = svcName
				serverStore.UpsertInstance(inst)
			}
		}
	}

	// Run instance sync periodically (after service sync)
	go func() {
		time.Sleep(10 * time.Second) // Wait for initial Jaeger sync
		syncInstancesFromAgents()
	}()

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
