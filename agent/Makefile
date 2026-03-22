APP_NAME := aitop-agent
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "0.1.0-dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GO_VERSION := $(shell go version | awk '{print $$3}')

LDFLAGS := -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.Version=$(VERSION) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.GitCommit=$(GIT_COMMIT) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.BuildDate=$(BUILD_DATE) \
           -X github.com/aurakimjh/aiservice-monitoring/agent/pkg/version.GoVersion=$(GO_VERSION)

.PHONY: build build-linux build-windows build-collection-server test clean run lint package \
        verify-pipeline verify-ui verify-all docker-test-up docker-test-down

## build: Build for current platform
build:
	go build -ldflags "$(LDFLAGS)" -o bin/$(APP_NAME) ./cmd/aitop-agent

## build-linux: Cross-compile for Linux amd64
build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-linux-amd64 ./cmd/aitop-agent

## build-linux-arm64: Cross-compile for Linux arm64
build-linux-arm64:
	GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-linux-arm64 ./cmd/aitop-agent

## build-windows: Cross-compile for Windows amd64
build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS) -s -w" -o bin/$(APP_NAME)-windows-amd64.exe ./cmd/aitop-agent

## build-collection-server: Build the collection server binary
build-collection-server:
	go build -ldflags "$(LDFLAGS)" -o bin/collection-server ./cmd/collection-server

## build-all: Build for all target platforms (agent + collection-server)
build-all: build-linux build-linux-arm64 build-windows build-collection-server

## package: Build Linux amd64 agent and copy deploy files into dist/
package: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	cp -r deploy/* dist/
	@echo "Package ready in dist/"

## package-deb: Build DEB package (requires nfpm)
package-deb: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	VERSION=$(VERSION) nfpm package --config deploy/nfpm.yaml --target dist/ --packager deb
	@echo "DEB package built in dist/"

## package-rpm: Build RPM package (requires nfpm)
package-rpm: build-linux
	@mkdir -p dist
	cp bin/$(APP_NAME)-linux-amd64 dist/$(APP_NAME)
	VERSION=$(VERSION) nfpm package --config deploy/nfpm.yaml --target dist/ --packager rpm
	@echo "RPM package built in dist/"

## package-all: Build DEB + RPM packages
package-all: package-deb package-rpm
	@echo "All packages built in dist/"

## test: Run all tests
test:
	go test -v -race -count=1 ./...

## test-cover: Run tests with coverage
test-cover:
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

## lint: Run linter
lint:
	golangci-lint run ./...

## run: Build and run with default config
run: build
	./bin/$(APP_NAME) --config=configs/agent.yaml

## run-collect-only: Run in one-shot collect-only mode
run-collect-only: build
	./bin/$(APP_NAME) --config=configs/agent.yaml --mode=collect-only

## clean: Remove build artifacts
clean:
	rm -rf bin/ dist/ coverage.out coverage.html

## deps: Download and tidy dependencies
deps:
	go mod download
	go mod tidy

## version: Print version info
version:
	@echo "Version:    $(VERSION)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"
	@echo "Go Version: $(GO_VERSION)"

## ─── Phase 17-3: 실데이터 통합 검증 ──────────────────────────────────────

## docker-test-up: Docker 테스트 환경 기동 (Collection Server + PostgreSQL + MinIO + OTel)
docker-test-up:
	docker compose -f ../infra/docker/docker-compose.test.yaml up -d --build
	@echo "Test environment started. Wait for health checks to pass (~30s)"

## docker-test-down: Docker 테스트 환경 종료 및 볼륨 삭제
docker-test-down:
	docker compose -f ../infra/docker/docker-compose.test.yaml down -v

## verify-install: Phase 17-3-1 — 에이전트 빌드 + Docker 컨테이너 등록
verify-install: build-linux
	chmod +x ../scripts/phase17-3/01-agent-install.sh
	../scripts/phase17-3/01-agent-install.sh

## verify-pipeline: Phase 17-3-2 — 데이터 파이프라인 검증
verify-pipeline:
	chmod +x ../scripts/phase17-3/02-pipeline-verify.sh
	../scripts/phase17-3/02-pipeline-verify.sh

## verify-ui: Phase 17-3-3~6 — UI 뷰 API 검증
verify-ui:
	chmod +x ../scripts/phase17-3/03-ui-api-verify.sh
	../scripts/phase17-3/03-ui-api-verify.sh

## verify-all: Phase 17-3 전체 실행 (Docker 기동 → 에이전트 설치 → 파이프라인 → UI)
verify-all:
	chmod +x ../scripts/phase17-3/run-all.sh
	../scripts/phase17-3/run-all.sh

## verify-all-no-docker: Phase 17-3 전체 실행 (Docker 미기동 — 이미 실행 중)
verify-all-no-docker:
	chmod +x ../scripts/phase17-3/run-all.sh
	../scripts/phase17-3/run-all.sh --no-docker --no-cleanup

## ─── Phase 7': E2E 통합 검증 ─────────────────────────────────────────────────

## e2e-up: E2E 전체 스택 기동 (Frontend + Collection Server + Agent + OTel + DB + S3)
e2e-up:
	docker compose -f ../docker-compose.e2e.yaml up -d --build
	@echo "E2E stack starting. Wait ~60s for all services to be healthy."
	@echo "Services: frontend(:3000) collection-server(:8080) prometheus(:9090) tempo(:3200) loki(:3100)"

## e2e-down: E2E 스택 종료 및 볼륨 삭제
e2e-down:
	docker compose -f ../docker-compose.e2e.yaml down -v
	@echo "E2E stack stopped and volumes removed."

## e2e-logs: E2E 스택 실시간 로그
e2e-logs:
	docker compose -f ../docker-compose.e2e.yaml logs -f

## e2e-ps: E2E 스택 컨테이너 상태 확인
e2e-ps:
	docker compose -f ../docker-compose.e2e.yaml ps

## e2e-health: Phase 7'-1 — 전체 서비스 헬스체크
e2e-health:
	chmod +x ../scripts/e2e/healthcheck.sh
	../scripts/e2e/healthcheck.sh

## e2e-trace: Phase 7'-3 — Trace 연속성 검증 (5레이어 traceId + Baggage)
e2e-trace:
	chmod +x ../scripts/e2e/trace-continuity.sh
	../scripts/e2e/trace-continuity.sh

## e2e-security: Phase 7'-4 — 보안 감사 (OWASP Top 10 + PII + mTLS)
e2e-security:
	chmod +x ../scripts/e2e/security-audit.sh
	../scripts/e2e/security-audit.sh

## e2e-load: Phase 7'-2 — 부하 테스트 (Locust 4시나리오, 10분)
e2e-load:
	@mkdir -p ../reports
	@command -v locust >/dev/null 2>&1 || (echo "ERROR: locust not installed. Run: pip install locust" && exit 1)
	locust -f ../locust/locustfile.py \
	       --config ../locust/locust.conf \
	       --host http://localhost:8080 \
	       --headless \
	       --users 200 \
	       --spawn-rate 10 \
	       --run-time 10m \
	       --html ../reports/e2e_load_report.html \
	       --csv ../reports/e2e_load
	@echo "Load test complete. Report: reports/e2e_load_report.html"

## e2e-load-ui: Phase 7'-2 — Locust Web UI 모드로 부하 테스트 시작
e2e-load-ui:
	@command -v locust >/dev/null 2>&1 || (echo "ERROR: locust not installed. Run: pip install locust" && exit 1)
	locust -f ../locust/locustfile.py \
	       --host http://localhost:8080 \
	       --web-host 0.0.0.0 \
	       --web-port 8089
	@echo "Locust UI: http://localhost:8089"

## e2e-all: Phase 7' 전체 실행 (헬스체크 → Trace → 보안 → 부하)
e2e-all: e2e-health e2e-trace e2e-security e2e-load
	@echo ""
	@echo "═══════════════════════════════════════════════"
	@echo " Phase 7' E2E 통합 검증 완료"
	@echo "═══════════════════════════════════════════════"
	@echo " 7'-1 헬스체크:    scripts/e2e/healthcheck.sh"
	@echo " 7'-2 부하 테스트: reports/e2e_load_report.html"
	@echo " 7'-3 Trace 연속성: scripts/e2e/trace-continuity.sh"
	@echo " 7'-4 보안 감사:   scripts/e2e/security-audit.sh"
	@echo "═══════════════════════════════════════════════"

## help: Show this help
help:
	@echo "Available targets:"
	@grep -E '^## ' Makefile | sed 's/## /  /'
