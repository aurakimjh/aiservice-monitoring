"""
외부 API 호출 — OTel 계측 HTTP 클라이언트

에이전트가 호출하는 외부 서비스(Serper, 커스텀 도구 API 등)에
W3C TraceContext 헤더를 자동 주입하고, 타임아웃/네트워크 에러를
별도 메트릭으로 분리하여 외부 API 병목 구간을 명확히 추적합니다.

사용법:
    from sdk_instrumentation.python.agents.external_api_tracer import (
        InstrumentedHTTPClient, instrument_requests_session
    )

    serper = InstrumentedHTTPClient("serper", "https://google.serper.dev", timeout=10.0)
    result = await serper.post("/search", json={"q": "AI observability"})
"""

import time
from typing import Any, Dict, Optional

import httpx
from opentelemetry import metrics, propagate, trace
from opentelemetry.semconv.trace import SpanAttributes
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.agent.external_api", "1.0.0")
meter  = metrics.get_meter("ai.agent.external_api", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

request_duration = meter.create_histogram(
    name="external_api.request.duration",
    description="외부 API 요청 레이턴시 (네트워크 포함)",
    unit="ms",
)
request_counter = meter.create_counter(
    name="external_api.request.total",
    description="외부 API 요청 총 횟수",
    unit="1",
)
error_counter = meter.create_counter(
    name="external_api.error.total",
    description="외부 API 에러 횟수 (4xx/5xx/timeout/network)",
    unit="1",
)
timeout_counter = meter.create_counter(
    name="external_api.timeout.total",
    description="외부 API 타임아웃 발생 횟수",
    unit="1",
)
response_size = meter.create_histogram(
    name="external_api.response.size",
    description="외부 API 응답 본문 크기",
    unit="By",
)


class InstrumentedHTTPClient:
    """
    W3C TraceContext 헤더를 자동 주입하는 계측 HTTP 클라이언트.

    httpx.AsyncClient를 래핑하여 모든 요청에 OTel Span을 생성하고
    traceparent 헤더를 주입합니다. 타임아웃/네트워크 에러는
    전용 카운터로 분리하여 외부 서비스 SLA 위반을 탐지합니다.
    """

    def __init__(
        self,
        service_name: str,
        base_url: str,
        timeout: float = 10.0,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.service_name = service_name
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(timeout),
            headers=headers or {},
            follow_redirects=True,
        )

    async def get(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("POST", path, **kwargs)

    async def put(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("PUT", path, **kwargs)

    async def delete(self, path: str, **kwargs) -> httpx.Response:
        return await self._request("DELETE", path, **kwargs)

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = f"{self.base_url}{path}"
        headers: Dict[str, str] = kwargs.pop("headers", {})

        # W3C TraceContext + Baggage 헤더 자동 주입
        # → 외부 서비스가 OTel을 지원한다면 동일 Trace ID로 연결됨
        propagate.inject(headers)

        base_labels = {
            "service": self.service_name,
            "method": method,
        }

        with tracer.start_as_current_span(
            f"external_api.{self.service_name}.{method.lower()}",
            kind=SpanKind.CLIENT,
            attributes={
                SpanAttributes.HTTP_METHOD: method,
                SpanAttributes.HTTP_URL: url,
                SpanAttributes.NET_PEER_NAME: self.service_name,
                "external_api.service": self.service_name,
                "external_api.timeout_configured_s": self.timeout,
                "external_api.path": path,
            },
        ) as span:
            start = time.perf_counter()
            request_counter.add(1, base_labels)

            try:
                response = await self._client.request(method, path, headers=headers, **kwargs)
                elapsed_ms = (time.perf_counter() - start) * 1000
                body_size  = len(response.content)
                status     = response.status_code
                status_class = f"{status // 100}xx"

                span.set_attributes({
                    SpanAttributes.HTTP_STATUS_CODE: status,
                    "external_api.response_time_ms": elapsed_ms,
                    "external_api.response_size_bytes": body_size,
                    "external_api.status_class": status_class,
                })

                labels = {**base_labels, "status_code": str(status), "status_class": status_class}
                request_duration.record(elapsed_ms, labels)
                response_size.record(body_size, base_labels)

                if status >= 500:
                    span.set_status(StatusCode.ERROR, f"HTTP {status}")
                    error_counter.add(1, {**base_labels, "error_type": "server_error", "status_code": str(status)})
                elif status >= 400:
                    # 4xx는 클라이언트 에러 — Span 에러로 마킹하되 별도 분류
                    span.add_event("external_api.client_error", {
                        "status_code": status,
                        "url": url,
                    })
                    error_counter.add(1, {**base_labels, "error_type": "client_error", "status_code": str(status)})

                return response

            except httpx.TimeoutException as exc:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, "Request timeout")
                span.set_attributes({
                    "external_api.timeout_occurred": True,
                    "external_api.response_time_ms": elapsed_ms,
                })
                request_duration.record(elapsed_ms, {**base_labels, "status_code": "timeout"})
                timeout_counter.add(1, {**base_labels, "error_type": "timeout"})
                error_counter.add(1,   {**base_labels, "error_type": "timeout"})
                raise

            except httpx.ConnectError as exc:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, "Connection failed")
                span.set_attribute("external_api.response_time_ms", elapsed_ms)
                request_duration.record(elapsed_ms, {**base_labels, "status_code": "connect_error"})
                error_counter.add(1, {**base_labels, "error_type": "connect_error"})
                raise

            except httpx.NetworkError as exc:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, "Network error")
                span.set_attribute("external_api.response_time_ms", elapsed_ms)
                request_duration.record(elapsed_ms, {**base_labels, "status_code": "network_error"})
                error_counter.add(1, {**base_labels, "error_type": "network_error"})
                raise

    async def close(self):
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()


class CircuitBreakerHTTPClient(InstrumentedHTTPClient):
    """
    Circuit Breaker 패턴이 적용된 계측 HTTP 클라이언트.

    연속 실패 임계치 초과 시 OPEN 상태로 전환하여
    외부 서비스 장애 시 에이전트 체인 전체 블로킹을 방지합니다.
    """

    CB_CLOSED   = "CLOSED"
    CB_OPEN     = "OPEN"
    CB_HALF_OPEN = "HALF_OPEN"

    circuit_state_gauge = meter.create_up_down_counter(
        name="external_api.circuit_breaker.state",
        description="Circuit Breaker 상태 (0=CLOSED, 1=OPEN, 2=HALF_OPEN)",
        unit="1",
    )

    def __init__(
        self,
        service_name: str,
        base_url: str,
        timeout: float = 10.0,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
    ):
        super().__init__(service_name, base_url, timeout)
        self._failure_count = 0
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._last_failure_time: Optional[float] = None
        self._state = self.CB_CLOSED

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        now = time.perf_counter()

        # OPEN 상태: 복구 시간이 지났으면 HALF_OPEN으로 전환
        if self._state == self.CB_OPEN:
            if self._last_failure_time and (now - self._last_failure_time) > self._recovery_timeout:
                self._state = self.CB_HALF_OPEN
            else:
                span = trace.get_current_span()
                span.add_event("circuit_breaker.rejected", {
                    "service": self.service_name,
                    "state": self.CB_OPEN,
                    "seconds_until_retry": self._recovery_timeout - (now - (self._last_failure_time or now)),
                })
                raise httpx.ConnectError(f"Circuit breaker OPEN for {self.service_name}")

        try:
            response = await super()._request(method, path, **kwargs)
            # 성공 시 CLOSED로 복귀
            if self._state == self.CB_HALF_OPEN:
                self._state = self.CB_CLOSED
                self._failure_count = 0
            return response
        except Exception:
            self._failure_count += 1
            self._last_failure_time = time.perf_counter()
            if self._failure_count >= self._failure_threshold:
                self._state = self.CB_OPEN
                span = trace.get_current_span()
                span.add_event("circuit_breaker.opened", {
                    "service": self.service_name,
                    "failure_count": self._failure_count,
                    "threshold": self._failure_threshold,
                })
            raise
