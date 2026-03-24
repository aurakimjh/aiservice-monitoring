"""
AITOP Phase 7'-2: 부하 테스트 — 4개 시나리오
==============================================
시나리오:
  1. APIQueryUser     — 대시보드 조회 (60% 비중)
  2. AgentRegUser     — 에이전트 등록 (10% 비중)
  3. HeartbeatUser    — 다수 에이전트 Heartbeat (20% 비중)
  4. CollectTrigUser  — 수집 작업 트리거 (10% 비중)

실행:
  locust -f locust/locustfile.py --host http://localhost:8080
  또는:
  locust -f locust/locustfile.py --config locust/locust.conf

목표:
  - 200 concurrent users @ 1K RPS
  - p95 응답시간 < 2000ms (API Query)
  - Tail Sampling 보존율 검증
"""

import random
import string
import time
import json
from typing import Optional

from locust import HttpUser, task, between, events, constant_pacing
from locust.runners import MasterRunner, LocalRunner


# ─────────────────────────────────────────────────────────
# 공통 설정
# ─────────────────────────────────────────────────────────

DEMO_CREDENTIALS = {
    "email": "admin@aitop.io",
    "password": "admin",
}

# 테스트용 에이전트 ID 풀
AGENT_ID_POOL = [f"load-test-agent-{i:03d}" for i in range(1, 51)]

# 가상 호스트 이름
HOSTNAMES = [f"server-{chr(65 + i % 26)}{i // 26:02d}" for i in range(50)]


def generate_random_id(prefix: str = "", length: int = 8) -> str:
    """랜덤 ID 생성"""
    chars = string.ascii_lowercase + string.digits
    random_part = "".join(random.choices(chars, k=length))
    return f"{prefix}{random_part}" if prefix else random_part


def generate_trace_id() -> str:
    """W3C TraceContext 형식 traceId 생성"""
    return "".join(random.choices("0123456789abcdef", k=32))


def generate_span_id() -> str:
    """W3C TraceContext 형식 spanId 생성"""
    return "".join(random.choices("0123456789abcdef", k=16))


# ─────────────────────────────────────────────────────────
# 시나리오 1: API 조회 사용자 (60% 비중)
# 대시보드 주요 API 조회 패턴 시뮬레이션
# ─────────────────────────────────────────────────────────
class APIQueryUser(HttpUser):
    """
    시나리오 1: API 조회 Flow
    - 로그인 → 에이전트 목록 → 상세 → 수집 작업 조회
    - 일반 SRE/운영자의 대시보드 조회 패턴
    """

    weight = 60
    wait_time = between(1, 3)

    def on_start(self):
        """로그인 및 JWT 토큰 획득"""
        self.jwt_token: Optional[str] = None
        self._login()

    def _login(self):
        """JWT 로그인"""
        with self.client.post(
            "/api/v1/auth/login",
            json=DEMO_CREDENTIALS,
            name="/api/v1/auth/login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                tokens = data.get("tokens", {})
                self.jwt_token = tokens.get("accessToken") or data.get("token")
                resp.success()
            elif resp.status_code == 401:
                resp.failure(f"Login failed: {resp.status_code}")
                self.jwt_token = None
            else:
                resp.failure(f"Login error: {resp.status_code}")
                self.jwt_token = None

    @property
    def auth_headers(self) -> dict:
        """인증 헤더"""
        trace_id = generate_trace_id()
        span_id = generate_span_id()
        headers = {
            "traceparent": f"00-{trace_id}-{span_id}-01",
            "Content-Type": "application/json",
        }
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    @task(5)
    def get_agents_list(self):
        """에이전트 목록 조회 (가장 빈번한 조회)"""
        with self.client.get(
            "/api/v1/fleet/agents",
            headers=self.auth_headers,
            name="/api/v1/fleet/agents [list]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401):
                resp.success()
            else:
                resp.failure(f"Unexpected: {resp.status_code}")

    @task(3)
    def get_agent_detail(self):
        """에이전트 상세 조회"""
        agent_id = random.choice(AGENT_ID_POOL)
        with self.client.get(
            f"/api/v1/fleet/agents/{agent_id}",
            headers=self.auth_headers,
            name="/api/v1/fleet/agents/{id} [detail]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 404):
                resp.success()
            else:
                resp.failure(f"Unexpected: {resp.status_code}")

    @task(3)
    def get_fleet_jobs(self):
        """수집 작업 목록 조회"""
        with self.client.get(
            "/api/v1/fleet/jobs",
            headers=self.auth_headers,
            name="/api/v1/fleet/jobs [list]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401):
                resp.success()
            else:
                resp.failure(f"Unexpected: {resp.status_code}")

    @task(2)
    def get_ai_services(self):
        """AI 서비스 목록 조회"""
        with self.client.get(
            "/api/v1/ai/services",
            headers=self.auth_headers,
            name="/api/v1/ai/services [list]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401):
                resp.success()
            else:
                resp.failure(f"Unexpected: {resp.status_code}")

    @task(2)
    def get_diagnostics_runs(self):
        """진단 실행 목록 조회"""
        with self.client.get(
            "/api/v1/diagnostics/runs",
            headers=self.auth_headers,
            name="/api/v1/diagnostics/runs [list]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401):
                resp.success()
            else:
                resp.failure(f"Unexpected: {resp.status_code}")

    @task(1)
    def health_check(self):
        """헬스체크 조회 (모니터링 시스템의 주기적 체크)"""
        with self.client.get(
            "/health",
            name="/health",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Health check failed: {resp.status_code}")

    @task(1)
    def refresh_token(self):
        """토큰 갱신"""
        if not self.jwt_token:
            self._login()
            return
        with self.client.post(
            "/api/v1/auth/refresh",
            headers=self.auth_headers,
            name="/api/v1/auth/refresh",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 400, 401, 404):
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        new_token = data.get("accessToken") or data.get("token")
                        if new_token:
                            self.jwt_token = new_token
                    except Exception:
                        pass
                resp.success()
            else:
                resp.failure(f"Refresh failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────
# 시나리오 2: 에이전트 등록 사용자 (10% 비중)
# 신규 에이전트 설치/등록 플로우 시뮬레이션
# ─────────────────────────────────────────────────────────
class AgentRegUser(HttpUser):
    """
    시나리오 2: 에이전트 등록 Flow
    - 관리자 로그인 → 에이전트 등록 → 플러그인 설정
    - 에이전트 신규 설치 시의 API 패턴
    """

    weight = 10
    wait_time = between(5, 15)

    def on_start(self):
        self.jwt_token: Optional[str] = None
        self.registered_agents: list = []
        self._login()

    def _login(self):
        with self.client.post(
            "/api/v1/auth/login",
            json=DEMO_CREDENTIALS,
            name="/api/v1/auth/login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                tokens = data.get("tokens", {})
                self.jwt_token = tokens.get("accessToken") or data.get("token")
                resp.success()
            else:
                resp.failure(f"Admin login failed: {resp.status_code}")

    @property
    def auth_headers(self) -> dict:
        headers = {
            "traceparent": f"00-{generate_trace_id()}-{generate_span_id()}-01",
            "Content-Type": "application/json",
        }
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    @task(3)
    def register_agent(self):
        """신규 에이전트 등록"""
        agent_id = f"reg-{generate_random_id('', 6)}"
        hostname = random.choice(HOSTNAMES)

        payload = {
            "agent_id": agent_id,
            "hostname": hostname,
            "agent_version": "1.2.0",
            "os_type": random.choice(["linux", "windows", "darwin"]),
            "status": "healthy",
            "cpu_percent": round(random.uniform(10.0, 90.0), 2),
            "memory_mb": round(random.uniform(256, 4096), 2),
            "plugins": [],
        }

        with self.client.post(
            "/api/v1/heartbeat",
            json=payload,
            headers=self.auth_headers,
            name="/api/v1/heartbeat [register]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 401, 400):
                if resp.status_code in (200, 201):
                    self.registered_agents.append(agent_id)
                resp.success()
            else:
                resp.failure(f"Register failed: {resp.status_code}")

    @task(2)
    def list_agents_after_register(self):
        """등록 후 에이전트 목록 확인"""
        with self.client.get(
            "/api/v1/agents",
            headers=self.auth_headers,
            name="/api/v1/agents [list-after-reg]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401):
                resp.success()
            else:
                resp.failure(f"List failed: {resp.status_code}")

    @task(1)
    def delete_agent(self):
        """에이전트 삭제 (등록된 에이전트 정리)"""
        if not self.registered_agents:
            return
        agent_id = self.registered_agents.pop()
        with self.client.delete(
            f"/api/v1/agents/{agent_id}",
            headers=self.auth_headers,
            name="/api/v1/agents/{id} [delete]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 204, 401, 404):
                resp.success()
            else:
                resp.failure(f"Delete failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────
# 시나리오 3: Heartbeat Storm (20% 비중)
# 다수 에이전트가 주기적으로 Heartbeat 전송
# ─────────────────────────────────────────────────────────
class HeartbeatUser(HttpUser):
    """
    시나리오 3: Heartbeat Storm
    - 에이전트들이 15초 간격으로 Heartbeat 전송
    - Collection Server의 Heartbeat 처리 성능 검증
    """

    weight = 20
    wait_time = between(10, 20)  # 에이전트 Heartbeat 간격

    def on_start(self):
        self.agent_id = random.choice(AGENT_ID_POOL)
        self.sequence = 0

    def _make_heartbeat_payload(self) -> dict:
        self.sequence += 1
        return {
            "agent_id": self.agent_id,
            "hostname": f"host-{self.agent_id}",
            "version": "1.2.0",
            "status": "running",
            "sequence": self.sequence,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "metrics": {
                "cpu_usage": round(random.uniform(10.0, 90.0), 2),
                "memory_usage": round(random.uniform(20.0, 85.0), 2),
                "disk_usage": round(random.uniform(30.0, 70.0), 2),
                "uptime_seconds": random.randint(3600, 86400),
            },
            "collectors": [
                {
                    "name": "it_collector",
                    "status": "running",
                    "last_collect": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "error_count": random.randint(0, 2),
                }
            ],
        }

    @task(10)
    def send_heartbeat(self):
        """Heartbeat 전송 (핵심 태스크)"""
        payload = self._make_heartbeat_payload()
        trace_id = generate_trace_id()
        span_id = generate_span_id()

        with self.client.post(
            "/api/v1/heartbeat",
            json=payload,
            headers={
                "traceparent": f"00-{trace_id}-{span_id}-01",
                "Content-Type": "application/json",
                "X-Agent-ID": self.agent_id,
            },
            name="/api/v1/heartbeat",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 204, 401, 400):
                resp.success()
            else:
                resp.failure(f"Heartbeat failed: {resp.status_code}")

    @task(1)
    def check_own_status(self):
        """자신의 에이전트 상태 조회"""
        with self.client.get(
            f"/api/v1/fleet/agents/{self.agent_id}",
            headers={
                "X-Agent-ID": self.agent_id,
                "traceparent": f"00-{generate_trace_id()}-{generate_span_id()}-01",
            },
            name="/api/v1/fleet/agents/{id} [status]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 404):
                resp.success()
            else:
                resp.failure(f"Status check failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────
# 시나리오 4: 수집 트리거 사용자 (10% 비중)
# 수집 작업 트리거 + 결과 조회 패턴
# ─────────────────────────────────────────────────────────
class CollectTrigUser(HttpUser):
    """
    시나리오 4: Collection Trigger Flow
    - 관리자가 수동으로 수집 작업을 트리거
    - 진단 보고서 생성 플로우
    """

    weight = 10
    wait_time = between(10, 30)

    def on_start(self):
        self.jwt_token: Optional[str] = None
        self.job_ids: list = []
        self._login()

    def _login(self):
        with self.client.post(
            "/api/v1/auth/login",
            json=DEMO_CREDENTIALS,
            name="/api/v1/auth/login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                tokens = data.get("tokens", {})
                self.jwt_token = tokens.get("accessToken") or data.get("token")
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code}")

    @property
    def auth_headers(self) -> dict:
        headers = {
            "traceparent": f"00-{generate_trace_id()}-{generate_span_id()}-01",
            "Content-Type": "application/json",
        }
        if self.jwt_token:
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    @task(3)
    def trigger_collection(self):
        """수집 작업 트리거"""
        agent_id = random.choice(AGENT_ID_POOL)
        payload = {
            "agent_id": agent_id,
            "collect_type": random.choice(["full", "incremental", "diagnostic"]),
            "priority": random.choice(["high", "normal", "low"]),
            "timeout_seconds": 300,
            "options": {
                "include_gpu": random.choice([True, False]),
                "include_logs": True,
                "compress": True,
            },
        }

        with self.client.post(
            f"/api/v1/agents/{agent_id}/collect",
            json=payload,
            headers=self.auth_headers,
            name="/api/v1/agents/{id}/collect",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 202, 401, 400, 404):
                resp.success()
            else:
                resp.failure(f"Trigger failed: {resp.status_code}")

    @task(3)
    def check_job_status(self):
        """수집 작업 상태 조회"""
        if self.job_ids:
            job_id = random.choice(self.job_ids)
            url = f"/api/v1/fleet/jobs"
            name = "/api/v1/fleet/jobs [detail]"
        else:
            url = "/api/v1/fleet/jobs"
            name = "/api/v1/fleet/jobs [list]"

        with self.client.get(
            url,
            headers=self.auth_headers,
            name=name,
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 404):
                resp.success()
            else:
                resp.failure(f"Job status failed: {resp.status_code}")

    @task(2)
    def trigger_diagnostic(self):
        """진단 보고서 생성 트리거"""
        agent_id = random.choice(AGENT_ID_POOL)
        payload = {
            "agent_id": agent_id,
            "report_type": random.choice(["health", "performance", "security", "full"]),
            "notify_email": None,  # PII 없음
        }

        with self.client.post(
            "/api/v1/diagnostics/trigger",
            json=payload,
            headers=self.auth_headers,
            name="/api/v1/diagnostics/trigger",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 202, 401, 400, 404):
                resp.success()
            else:
                resp.failure(f"Diagnostic trigger failed: {resp.status_code}")

    @task(1)
    def get_diagnostic_report(self):
        """진단 보고서 조회"""
        agent_id = random.choice(AGENT_ID_POOL)
        with self.client.get(
            f"/api/v1/diagnostics/runs?agent={agent_id}",
            headers=self.auth_headers,
            name="/api/v1/diagnostics/runs [agent-filter]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 401, 404):
                resp.success()
            else:
                resp.failure(f"Diagnostic list failed: {resp.status_code}")


# ─────────────────────────────────────────────────────────
# Locust 이벤트 훅 — 테스트 시작/종료 리포트
# ─────────────────────────────────────────────────────────
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("\n" + "="*60)
    print("AITOP Phase 7'-2: 부하 테스트 시작")
    print("="*60)
    print("시나리오:")
    print("  1. APIQueryUser     — 대시보드 조회 (60%)")
    print("  2. AgentRegUser     — 에이전트 등록 (10%)")
    print("  3. HeartbeatUser    — Heartbeat Storm (20%)")
    print("  4. CollectTrigUser  — 수집 트리거 (10%)")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    stats = environment.stats
    print("\n" + "="*60)
    print("AITOP Phase 7'-2: 부하 테스트 완료")
    print("="*60)

    total = stats.total
    print(f"전체 요청: {total.num_requests}")
    print(f"실패 요청: {total.num_failures}")
    print(f"실패율:   {total.fail_ratio * 100:.1f}%")
    print(f"p50:      {total.get_response_time_percentile(0.5):.0f}ms")
    print(f"p95:      {total.get_response_time_percentile(0.95):.0f}ms")
    print(f"p99:      {total.get_response_time_percentile(0.99):.0f}ms")

    # 성공 기준 평가
    p95 = total.get_response_time_percentile(0.95)
    fail_rate = total.fail_ratio * 100

    print("\n성공 기준 평가:")
    print(f"  p95 < 2000ms:    {'✓ PASS' if p95 < 2000 else '✗ FAIL'} ({p95:.0f}ms)")
    print(f"  실패율 < 1%:     {'✓ PASS' if fail_rate < 1 else '✗ FAIL'} ({fail_rate:.1f}%)")
    print("="*60 + "\n")
