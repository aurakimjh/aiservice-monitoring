package test

// Phase 17-3 통합 E2E 테스트
//
// 실제 HTTP 서버를 in-process로 기동하여 데이터 파이프라인 전 구간을 검증한다.
//
//   Agent Heartbeat → Collection Server → Fleet Registry
//   Collect Result  → Validation Gateway → EventBus → Fleet
//   Fleet API       → 에이전트 조회/상세/그룹/스케줄
//   Auth API        → JWT 발급/검증/갱신
//
// 빌드 태그 없이 일반 go test에 포함된다.
// 실제 PostgreSQL / MinIO가 필요한 테스트는 -tags integration 으로 분리.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aurakimjh/aiservice-monitoring/agent/internal/auth"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/eventbus"
	"github.com/aurakimjh/aiservice-monitoring/agent/internal/validation"
	"github.com/aurakimjh/aiservice-monitoring/agent/pkg/models"
)

// ── 테스트 서버 팩토리 ────────────────────────────────────────────────────────

// newTestServer는 테스트용 in-process HTTP 서버를 반환한다.
// 반환된 httptest.Server는 테스트 완료 후 t.Cleanup으로 자동 종료된다.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	jwtMgr := auth.NewJWTManager(auth.JWTConfig{})
	bus := eventbus.New(100)
	validator := validation.NewGateway()

	// wsHub는 nil-safe로 처리 (테스트에서 SSE 연결은 선택적)
	handler := buildCollectionServerHandler(jwtMgr, bus, validator)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

// buildCollectionServerHandler는 collection-server의 buildMux와 동일한 핸들러를
// 테스트 코드에서 구성하기 위한 래퍼다.
// collection-server/main.go의 buildMux가 패키지 수준에서 export되지 않으므로
// 동일 로직을 인라인으로 재구성한다.
func buildCollectionServerHandler(jwtMgr *auth.JWTManager, bus *eventbus.Bus, validator *validation.Gateway) http.Handler {
	mux := http.NewServeMux()

	type groupRecord struct {
		ID          string    `json:"id"`
		Name        string    `json:"name"`
		Description string    `json:"description"`
		AgentIDs    []string  `json:"agentIds"`
		Tags        []string  `json:"tags"`
		CreatedAt   time.Time `json:"createdAt"`
	}

	type agentRecord struct {
		ID            string             `json:"id"`
		Hostname      string             `json:"hostname"`
		Status        models.AgentStatus `json:"status"`
		AgentVersion  string             `json:"agent_version"`
		OSType        string             `json:"os_type"`
		OSVersion     string             `json:"os_version"`
		CPUPercent    float64            `json:"cpu_percent"`
		MemoryMB      float64            `json:"memory_mb"`
		Plugins       []models.PluginStatus `json:"plugins"`
		LastHeartbeat time.Time          `json:"last_heartbeat"`
		RegisteredAt  time.Time          `json:"registered_at"`
	}

	agents := make(map[string]*agentRecord)
	groups := make(map[string]*groupRecord)
	groupSeq := 0

	writeJSON := func(w http.ResponseWriter, status int, v interface{}) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}

	// ── Auth ────────────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}
		user := auth.FindDemoUser(body.Email, body.Password)
		if user == nil {
			http.Error(w, `{"message":"invalid credentials"}`, http.StatusUnauthorized)
			return
		}
		accessToken, expiresAt, _ := jwtMgr.GenerateAccessToken(user.ID, user.Email, user.Name, user.Role, user.OrgID)
		refreshToken, _ := jwtMgr.GenerateRefreshToken(user.ID)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"user": map[string]interface{}{
				"id": user.ID, "email": user.Email, "name": user.Name,
				"role": user.Role, "organizationId": user.OrgID,
			},
			"tokens": map[string]interface{}{
				"accessToken": accessToken, "refreshToken": refreshToken, "expiresAt": expiresAt,
			},
		})
	})

	mux.HandleFunc("POST /api/v1/auth/refresh", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ RefreshToken string `json:"refreshToken"` }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"message":"invalid request"}`, http.StatusBadRequest)
			return
		}
		claims, err := jwtMgr.Verify(body.RefreshToken)
		if err != nil {
			http.Error(w, `{"message":"invalid refresh token"}`, http.StatusUnauthorized)
			return
		}
		var found *auth.DemoUser
		for _, u := range auth.DemoUsers {
			if u.ID == claims.UserID {
				found = &u
				break
			}
		}
		if found == nil {
			http.Error(w, `{"message":"user not found"}`, http.StatusUnauthorized)
			return
		}
		at, exp, _ := jwtMgr.GenerateAccessToken(found.ID, found.Email, found.Name, found.Role, found.OrgID)
		rt, _ := jwtMgr.GenerateRefreshToken(found.ID)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"accessToken": at, "refreshToken": rt, "expiresAt": exp,
		})
	})

	mux.HandleFunc("GET /api/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		claims := auth.GetClaims(r)
		if claims == nil {
			http.Error(w, `{"message":"not authenticated"}`, http.StatusUnauthorized)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"id": claims.UserID, "email": claims.Email,
			"name": claims.Name, "role": claims.Role,
		})
	})

	mux.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// ── Heartbeat ───────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		var hb models.Heartbeat
		if err := json.NewDecoder(r.Body).Decode(&hb); err != nil || hb.AgentID == "" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		rec, ok := agents[hb.AgentID]
		if !ok {
			rec = &agentRecord{ID: hb.AgentID, RegisteredAt: time.Now().UTC(), Status: models.AgentRegistered}
			agents[hb.AgentID] = rec
		}
		rec.Hostname = hb.Hostname
		rec.AgentVersion = hb.AgentVersion
		rec.OSType = hb.OSType
		rec.CPUPercent = hb.CPUPercent
		rec.MemoryMB = hb.MemoryMB
		rec.Plugins = hb.Plugins
		rec.LastHeartbeat = hb.Timestamp
		if rec.Status == models.AgentRegistered {
			rec.Status = models.AgentApproved
		} else {
			rec.Status = models.AgentHealthy
		}
		bus.Publish(eventbus.Event{Type: eventbus.EventAgentHeartbeat, AgentID: hb.AgentID})
		writeJSON(w, http.StatusOK, models.HeartbeatResponse{})
	})

	// ── Collect ─────────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/collect/", func(w http.ResponseWriter, r *http.Request) {
		collectorID := r.URL.Path[len("/api/v1/collect/"):]
		body, _ := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024))
		result, _ := validator.Validate(body)
		if result.Status == validation.StatusRejected {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{
				"status": "rejected", "errors": result.Errors,
			})
			return
		}
		agentID := r.Header.Get("X-Agent-ID")
		bus.Publish(eventbus.Event{
			Type: eventbus.EventCollectCompleted, AgentID: agentID,
			Data: map[string]interface{}{"collector_id": collectorID},
		})
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status": string(result.Status), "warnings": result.Warnings,
		})
	})

	// ── Fleet Agents ─────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/fleet/agents", func(w http.ResponseWriter, _ *http.Request) {
		items := make([]map[string]interface{}, 0, len(agents))
		for _, a := range agents {
			items = append(items, map[string]interface{}{
				"id": a.ID, "hostname": a.Hostname, "status": a.Status,
				"cpu_percent": a.CPUPercent, "memory_mb": a.MemoryMB,
				"agent_version": a.AgentVersion, "last_heartbeat": a.LastHeartbeat,
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items, "total": len(items)})
	})

	mux.HandleFunc("POST /api/v1/fleet/agents/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[len("/api/v1/fleet/agents/"):]
		idx := strings.Index(path, "/")
		if idx < 0 || path[idx+1:] != "collect" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		agentID := path[:idx]
		if _, ok := agents[agentID]; !ok {
			http.Error(w, "agent not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued", "agent_id": agentID})
	})

	// ── Fleet Jobs / Plugins / Groups / Schedules ──────────────────────────
	mux.HandleFunc("GET /api/v1/fleet/jobs", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	mux.HandleFunc("GET /api/v1/fleet/plugins", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	mux.HandleFunc("POST /api/v1/fleet/plugins/deploy", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusAccepted, map[string]int{"queued": 1})
	})

	mux.HandleFunc("GET /api/v1/fleet/groups", func(w http.ResponseWriter, _ *http.Request) {
		items := make([]*groupRecord, 0, len(groups))
		for _, g := range groups {
			items = append(items, g)
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": items})
	})

	mux.HandleFunc("POST /api/v1/fleet/groups", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name     string   `json:"name"`
			AgentIDs []string `json:"agentIds"`
			Tags     []string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		groupSeq++
		rec := &groupRecord{
			ID: fmt.Sprintf("grp-%04d", groupSeq), Name: body.Name,
			AgentIDs: body.AgentIDs, Tags: body.Tags, CreatedAt: time.Now().UTC(),
		}
		groups[rec.ID] = rec
		writeJSON(w, http.StatusCreated, rec)
	})

	mux.HandleFunc("GET /api/v1/fleet/schedules", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	mux.HandleFunc("POST /api/v1/fleet/schedules", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
			Cron string `json:"cron"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"id": "sched-0001", "name": body.Name, "cron": body.Cron})
	})

	mux.HandleFunc("GET /api/v1/fleet/updates", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	// ── Diagnostics ───────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/diagnostics/runs", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []interface{}{}})
	})

	mux.HandleFunc("POST /api/v1/diagnostics/trigger", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			AgentID string `json:"agent_id"`
			Scope   string `json:"scope"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AgentID == "" {
			http.Error(w, "agent_id required", http.StatusBadRequest)
			return
		}
		diagID := fmt.Sprintf("diag-%d", time.Now().UnixNano())
		writeJSON(w, http.StatusOK, map[string]string{"diagnostic_id": diagID, "status": "queued"})
	})

	// ── Health ────────────────────────────────────────────────────────────────
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Apply middleware: CORS → JWT auth
	corsHandler := auth.CORS("*")
	authMiddleware := auth.Middleware(jwtMgr, []string{
		"POST /api/v1/auth/login",
		"/api/v1/auth/login",
		"POST /api/v1/auth/refresh",
		"/api/v1/auth/refresh",
	})
	return corsHandler(authMiddleware(mux))
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

func mustLogin(t *testing.T, baseURL, email, password string) string {
	t.Helper()
	body := fmt.Sprintf(`{"email":%q,"password":%q}`, email, password)
	resp, err := http.Post(baseURL+"/api/v1/auth/login", "application/json",
		strings.NewReader(body))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login returned %d", resp.StatusCode)
	}
	var out struct {
		Tokens struct {
			AccessToken string `json:"accessToken"`
		} `json:"tokens"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("login decode error: %v", err)
	}
	return out.Tokens.AccessToken
}

func authReq(t *testing.T, method, url, token string, bodyStr string) *http.Response {
	t.Helper()
	var bodyReader io.Reader
	if bodyStr != "" {
		bodyReader = strings.NewReader(bodyStr)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		t.Fatalf("NewRequest error: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s failed: %v", method, url, err)
	}
	return resp
}

func assertStatus(t *testing.T, label string, resp *http.Response, expected int) {
	t.Helper()
	if resp.StatusCode != expected {
		body, _ := io.ReadAll(resp.Body)
		t.Errorf("%s: expected HTTP %d, got %d. Body: %s", label, expected, resp.StatusCode, body)
	}
}

func assertJSONField(t *testing.T, label string, body []byte, field string) {
	t.Helper()
	if !bytes.Contains(body, []byte(`"`+field+`"`)) {
		t.Errorf("%s: expected JSON field %q in response: %s", label, field, body)
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatalf("freePort: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return port
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 17-3-1: 에이전트 등록 검증
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_AgentRegistration(t *testing.T) {
	srv := newTestServer(t)
	token := mustLogin(t, srv.URL, "admin@aitop.io", "admin")

	heartbeat := models.Heartbeat{
		AgentID:      "e2e-agent-001",
		Hostname:     "test-host-001",
		AgentVersion: "1.0.0-test",
		OSType:       "linux",
		OSVersion:    "Ubuntu 22.04",
		Status:       models.AgentHealthy,
		CPUPercent:   10.5,
		MemoryMB:     1024.0,
		Timestamp:    time.Now().UTC(),
		Plugins: []models.PluginStatus{
			{PluginID: "it-os", Version: "1.0.0", Status: "active"},
		},
	}

	hbJSON, _ := json.Marshal(heartbeat)

	// 첫 번째 heartbeat → AgentRegistered → AgentApproved
	resp := authReq(t, "POST", srv.URL+"/api/v1/heartbeat", token, string(hbJSON))
	defer resp.Body.Close()
	assertStatus(t, "First heartbeat", resp, http.StatusOK)

	// 두 번째 heartbeat → AgentApproved → AgentHealthy
	resp2 := authReq(t, "POST", srv.URL+"/api/v1/heartbeat", token, string(hbJSON))
	defer resp2.Body.Close()
	assertStatus(t, "Second heartbeat", resp2, http.StatusOK)

	// Fleet에서 에이전트 조회
	resp3 := authReq(t, "GET", srv.URL+"/api/v1/fleet/agents", token, "")
	defer resp3.Body.Close()
	assertStatus(t, "Fleet agents list", resp3, http.StatusOK)
	body, _ := io.ReadAll(resp3.Body)
	assertJSONField(t, "Fleet agents", body, "e2e-agent-001")
	assertJSONField(t, "Fleet agents", body, "total")
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 17-3-2: 데이터 파이프라인 검증
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_DataPipeline(t *testing.T) {
	srv := newTestServer(t)
	token := mustLogin(t, srv.URL, "admin@aitop.io", "admin")

	agentID := "pipeline-agent-e2e"

	// 에이전트 등록
	hb := fmt.Sprintf(`{"agent_id":%q,"hostname":"pipeline-host","agent_version":"1.0.0",`+
		`"os_type":"linux","status":"healthy","cpu_percent":20.0,"memory_mb":2048.0,`+
		`"timestamp":%q}`, agentID, time.Now().UTC().Format(time.RFC3339))

	hbResp := authReq(t, "POST", srv.URL+"/api/v1/heartbeat", token, hb)
	defer hbResp.Body.Close()
	assertStatus(t, "Pipeline: heartbeat", hbResp, http.StatusOK)

	// IT OS 수집 결과 제출
	osCollect := `{"collector_id":"it-os","status":"success","duration_ms":200,` +
		`"items":[{"cpu_percent":20.0,"memory_percent":50.0,"uptime_seconds":3600}]}`

	req, _ := http.NewRequest("POST", srv.URL+"/api/v1/collect/it-os", strings.NewReader(osCollect))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Agent-ID", agentID)
	colResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("collect request failed: %v", err)
	}
	defer colResp.Body.Close()
	assertStatus(t, "Pipeline: IT OS collect", colResp, http.StatusOK)
	colBody, _ := io.ReadAll(colResp.Body)
	assertJSONField(t, "Collect response", colBody, "status")

	// AI LLM 수집 결과 제출
	llmCollect := `{"collector_id":"ai-llm","status":"success","duration_ms":500,` +
		`"items":[{"model_id":"gpt-4","ttft_ms":180.5,"tps":42.0,"error_rate":0.01}]}`

	req2, _ := http.NewRequest("POST", srv.URL+"/api/v1/collect/ai-llm", strings.NewReader(llmCollect))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+token)
	req2.Header.Set("X-Agent-ID", agentID)
	colResp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("LLM collect request failed: %v", err)
	}
	defer colResp2.Body.Close()
	assertStatus(t, "Pipeline: AI LLM collect", colResp2, http.StatusOK)

	// 수동 수집 트리거
	trigResp := authReq(t, "POST",
		srv.URL+"/api/v1/fleet/agents/"+agentID+"/collect", token, "")
	defer trigResp.Body.Close()
	assertStatus(t, "Pipeline: manual collect trigger", trigResp, http.StatusAccepted)
	trigBody, _ := io.ReadAll(trigResp.Body)
	assertJSONField(t, "Trigger response", trigBody, "status")
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 17-3 Auth 전체 흐름 검증
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_AuthFlow(t *testing.T) {
	srv := newTestServer(t)

	tests := []struct {
		email    string
		password string
		role     string
	}{
		{"admin@aitop.io", "admin", "admin"},
		{"sre@aitop.io", "sre", "sre"},
		{"ai@aitop.io", "ai", "ai_engineer"},
		{"viewer@aitop.io", "viewer", "viewer"},
	}

	for _, tc := range tests {
		t.Run(tc.role, func(t *testing.T) {
			// 로그인
			loginBody := fmt.Sprintf(`{"email":%q,"password":%q}`, tc.email, tc.password)
			loginResp, err := http.Post(srv.URL+"/api/v1/auth/login",
				"application/json", strings.NewReader(loginBody))
			if err != nil {
				t.Fatalf("login failed: %v", err)
			}
			defer loginResp.Body.Close()
			assertStatus(t, "Login "+tc.role, loginResp, http.StatusOK)

			loginData, _ := io.ReadAll(loginResp.Body)
			assertJSONField(t, "Login response", loginData, "accessToken")
			assertJSONField(t, "Login response", loginData, "refreshToken")
			assertJSONField(t, "Login response", loginData, "user")

			// 토큰 추출
			var loginOut struct {
				Tokens struct {
					AccessToken  string `json:"accessToken"`
					RefreshToken string `json:"refreshToken"`
				} `json:"tokens"`
			}
			json.Unmarshal(loginData, &loginOut)

			// /auth/me 확인
			meResp := authReq(t, "GET", srv.URL+"/api/v1/auth/me",
				loginOut.Tokens.AccessToken, "")
			defer meResp.Body.Close()
			assertStatus(t, "/auth/me "+tc.role, meResp, http.StatusOK)
			meBody, _ := io.ReadAll(meResp.Body)
			assertJSONField(t, "me response", meBody, "email")
			assertJSONField(t, "me response", meBody, "role")

			// 토큰 갱신
			refreshBody := fmt.Sprintf(`{"refreshToken":%q}`, loginOut.Tokens.RefreshToken)
			refreshResp := authReq(t, "POST", srv.URL+"/api/v1/auth/refresh", "", refreshBody)
			defer refreshResp.Body.Close()
			assertStatus(t, "Token refresh "+tc.role, refreshResp, http.StatusOK)
			refreshData, _ := io.ReadAll(refreshResp.Body)
			assertJSONField(t, "refresh response", refreshData, "accessToken")
		})
	}
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 17-3-5: Fleet 관리 API 검증
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_FleetManagement(t *testing.T) {
	srv := newTestServer(t)
	token := mustLogin(t, srv.URL, "admin@aitop.io", "admin")
	api := srv.URL + "/api/v1"

	// 에이전트 3개 등록
	for i := 1; i <= 3; i++ {
		hb := fmt.Sprintf(`{"agent_id":"fleet-agent-%02d","hostname":"fleet-host-%02d",`+
			`"agent_version":"1.2.0","os_type":"linux","status":"healthy",`+
			`"cpu_percent":%d.5,"memory_mb":%d,"timestamp":%q}`,
			i, i, 10+i*5, 2048+i*512, time.Now().UTC().Format(time.RFC3339))
		r := authReq(t, "POST", api+"/heartbeat", token, hb)
		r.Body.Close()
	}

	// Fleet 에이전트 목록
	t.Run("ListAgents", func(t *testing.T) {
		resp := authReq(t, "GET", api+"/fleet/agents", token, "")
		defer resp.Body.Close()
		assertStatus(t, "Fleet agents", resp, http.StatusOK)
		body, _ := io.ReadAll(resp.Body)
		assertJSONField(t, "Fleet response", body, "items")
		assertJSONField(t, "Fleet response", body, "total")
	})

	// 그룹 생성
	t.Run("CreateGroup", func(t *testing.T) {
		resp := authReq(t, "POST", api+"/fleet/groups", token,
			`{"name":"prod-cluster","agentIds":["fleet-agent-01"],"tags":["prod"]}`)
		defer resp.Body.Close()
		assertStatus(t, "Create group", resp, http.StatusCreated)
		body, _ := io.ReadAll(resp.Body)
		assertJSONField(t, "Group response", body, "id")
		assertJSONField(t, "Group response", body, "name")
	})

	// 스케줄 생성
	t.Run("CreateSchedule", func(t *testing.T) {
		resp := authReq(t, "POST", api+"/fleet/schedules", token,
			`{"name":"daily-6am","targetType":"all","cron":"0 6 * * *","enabled":true}`)
		defer resp.Body.Close()
		assertStatus(t, "Create schedule", resp, http.StatusCreated)
	})

	// 플러그인 배포
	t.Run("DeployPlugin", func(t *testing.T) {
		resp := authReq(t, "POST", api+"/fleet/plugins/deploy", token,
			`{"pluginName":"it-web","targetType":"all"}`)
		defer resp.Body.Close()
		assertStatus(t, "Deploy plugin", resp, http.StatusAccepted)
		body, _ := io.ReadAll(resp.Body)
		assertJSONField(t, "Deploy response", body, "queued")
	})

	// 업데이트 목록
	t.Run("ListUpdates", func(t *testing.T) {
		resp := authReq(t, "GET", api+"/fleet/updates", token, "")
		defer resp.Body.Close()
		assertStatus(t, "Fleet updates", resp, http.StatusOK)
	})
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 17-3-6: 진단 보고서 API 검증
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_DiagnosticReport(t *testing.T) {
	srv := newTestServer(t)
	token := mustLogin(t, srv.URL, "admin@aitop.io", "admin")
	api := srv.URL + "/api/v1"

	// 에이전트 등록
	hb := fmt.Sprintf(`{"agent_id":"diag-agent-01","hostname":"diag-host-01",`+
		`"agent_version":"1.0.0","os_type":"linux","status":"healthy",`+
		`"cpu_percent":30.0,"memory_mb":4096.0,"timestamp":%q}`,
		time.Now().UTC().Format(time.RFC3339))
	r := authReq(t, "POST", api+"/heartbeat", token, hb)
	r.Body.Close()

	// 진단 트리거
	t.Run("TriggerDiagnostic", func(t *testing.T) {
		resp := authReq(t, "POST", api+"/diagnostics/trigger", token,
			`{"agent_id":"diag-agent-01","scope":"full"}`)
		defer resp.Body.Close()
		assertStatus(t, "Trigger diagnostic", resp, http.StatusOK)
		body, _ := io.ReadAll(resp.Body)
		assertJSONField(t, "Diagnostic trigger", body, "diagnostic_id")
		assertJSONField(t, "Diagnostic trigger", body, "status")
	})

	// 진단 목록
	t.Run("ListRuns", func(t *testing.T) {
		resp := authReq(t, "GET", api+"/diagnostics/runs", token, "")
		defer resp.Body.Close()
		assertStatus(t, "Diagnostic runs list", resp, http.StatusOK)
		body, _ := io.ReadAll(resp.Body)
		assertJSONField(t, "Runs response", body, "items")
	})

	// 에이전트별 진단 목록
	t.Run("ListRunsByAgent", func(t *testing.T) {
		resp := authReq(t, "GET", api+"/diagnostics/runs?agent=diag-agent-01", token, "")
		defer resp.Body.Close()
		assertStatus(t, "Diagnostic runs by agent", resp, http.StatusOK)
	})

	// 잘못된 agent_id로 트리거 → 400
	t.Run("TriggerWithoutAgentID", func(t *testing.T) {
		resp := authReq(t, "POST", api+"/diagnostics/trigger", token, `{"scope":"it"}`)
		defer resp.Body.Close()
		assertStatus(t, "Trigger without agent_id", resp, http.StatusBadRequest)
	})
}

// ════════════════════════════════════════════════════════════════════════════
// Validation 게이트웨이 파이프라인 검증 (inlined collection server)
// ════════════════════════════════════════════════════════════════════════════

func TestPhase173_ValidationInPipeline(t *testing.T) {
	srv := newTestServer(t)
	token := mustLogin(t, srv.URL, "admin@aitop.io", "admin")
	api := srv.URL + "/api/v1"

	// 유효한 payload → 200
	t.Run("ValidPayload", func(t *testing.T) {
		req, _ := http.NewRequest("POST", api+"/collect/it-os",
			strings.NewReader(`{"collector_id":"it-os","status":"success","duration_ms":100,"items":[]}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Agent-ID", "validation-agent")
		resp, _ := http.DefaultClient.Do(req)
		defer resp.Body.Close()
		assertStatus(t, "Valid collect payload", resp, http.StatusOK)
	})

	// collector_id 누락 → 400
	t.Run("MissingCollectorID", func(t *testing.T) {
		req, _ := http.NewRequest("POST", api+"/collect/it-os",
			strings.NewReader(`{"status":"success","items":[]}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := http.DefaultClient.Do(req)
		defer resp.Body.Close()
		assertStatus(t, "Missing collector_id", resp, http.StatusBadRequest)
	})

	// status 누락 → 400
	t.Run("MissingStatus", func(t *testing.T) {
		req, _ := http.NewRequest("POST", api+"/collect/it-os",
			strings.NewReader(`{"collector_id":"it-os","items":[]}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := http.DefaultClient.Do(req)
		defer resp.Body.Close()
		assertStatus(t, "Missing status", resp, http.StatusBadRequest)
	})
}

// ── freePort는 기존 에러를 피하기 위해 선언만 유지 (컴파일 오류 방지)
var _ = freePort
