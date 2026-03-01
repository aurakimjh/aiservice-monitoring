#!/usr/bin/env python3
"""
Context Propagation 단절 검증 스크립트

Grafana Tempo API에 TraceQL 쿼리를 보내
'가드레일 Span은 있지만 LLM Span이 없는' 단절 트레이스를 탐지합니다.
CI 파이프라인에서 배포 후 자동으로 실행하거나, 수동으로 실행하여
분산 추적 연속성을 검증합니다.

사용법:
    python scripts/validate-traces.py --tempo-url http://localhost:3200
    python scripts/validate-traces.py --tempo-url http://tempo:3200 --hours 1 --fail-on-broken
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime, timedelta, timezone

import httpx


TEMPO_URL_DEFAULT = "http://localhost:3200"

# 단절 탐지 TraceQL 쿼리 목록
# 각 쿼리는 "정상이라면 없어야 할" 패턴을 검색합니다.
BROKEN_TRACE_QUERIES = [
    {
        "name": "가드레일 Span 있음 + LLM Span 없음",
        "description": "가드레일 이후 LLM 호출 구간에서 Trace ID가 끊긴 경우",
        "query": '{.guardrail.action != ""} && !{.llm.provider != ""}',
    },
    {
        "name": "FastAPI Span 있음 + Agent Span 없음",
        "description": "API 계층에서 Agent 계층으로 전파가 끊긴 경우",
        "query": '{span.http.route =~ "/v1/.*"} && !{span.agent.chain.name != ""}',
    },
    {
        "name": "Agent Span 있음 + VectorDB Span 없음 (RAG 파이프라인)",
        "description": "Agent가 벡터 DB를 호출해야 하는데 Span이 없는 경우",
        "query": '{.agent.tool.name =~ ".*retriev.*"} && !{.db.system =~ ".*"}',
    },
]

# 성능 이상 탐지 쿼리 (단절은 아니지만 SLO 위반 탐지)
ANOMALY_QUERIES = [
    {
        "name": "TTFT 3초 초과 트레이스",
        "description": "LLM 첫 토큰 시간이 3000ms를 초과한 트레이스",
        "query": '{.llm.ttft_ms > 3000}',
        "severity": "warning",
    },
    {
        "name": "가드레일 차단 트레이스",
        "description": "입력이 가드레일에 의해 차단된 트레이스",
        "query": '{.guardrail.action = "BLOCK"}',
        "severity": "info",
    },
    {
        "name": "외부 API 타임아웃 트레이스",
        "description": "외부 API 호출에서 타임아웃이 발생한 트레이스",
        "query": '{.external_api.timeout_occurred = "true"}',
        "severity": "warning",
    },
    {
        "name": "에러 트레이스 (전체)",
        "description": "하나 이상의 Span이 ERROR 상태인 트레이스",
        "query": '{status = error}',
        "severity": "critical",
    },
]


async def query_tempo(
    client: httpx.AsyncClient,
    tempo_url: str,
    traceql: str,
    start: datetime,
    end: datetime,
    limit: int = 20,
) -> list:
    """Grafana Tempo Search API로 TraceQL 쿼리를 실행합니다."""
    params = {
        "q": traceql,
        "start": int(start.timestamp()),
        "end": int(end.timestamp()),
        "limit": limit,
    }
    try:
        resp = await client.get(f"{tempo_url}/api/search", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json().get("traces", [])
    except httpx.HTTPStatusError as e:
        print(f"  [HTTP ERROR] {e.response.status_code}: {e.response.text[:200]}")
        return []
    except httpx.RequestError as e:
        print(f"  [CONNECTION ERROR] Tempo에 연결할 수 없습니다: {e}")
        return []


def format_duration(ms: float) -> str:
    if ms < 1000:
        return f"{ms:.0f}ms"
    return f"{ms/1000:.1f}s"


async def run_validation(
    tempo_url: str,
    hours: int,
    fail_on_broken: bool,
    output_json: bool,
) -> dict:
    now   = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    print(f"\n{'='*60}")
    print(f"  AI Service Context Propagation 검증")
    print(f"  기간: 최근 {hours}시간 ({start.strftime('%H:%M')} ~ {now.strftime('%H:%M')} UTC)")
    print(f"  Tempo: {tempo_url}")
    print(f"{'='*60}\n")

    results = {
        "timestamp": now.isoformat(),
        "tempo_url": tempo_url,
        "period_hours": hours,
        "broken_traces": [],
        "anomalies": [],
        "summary": {
            "broken_count": 0,
            "anomaly_count": 0,
            "status": "PASS",
        },
    }

    async with httpx.AsyncClient() as client:
        # 1. 단절 트레이스 탐지
        print("── 1. Context Propagation 단절 탐지 ──────────────────────")
        total_broken = 0

        for q in BROKEN_TRACE_QUERIES:
            print(f"\n  검사: {q['name']}")
            print(f"  설명: {q['description']}")
            traces = await query_tempo(client, tempo_url, q["query"], start, now)

            if traces:
                total_broken += len(traces)
                print(f"  ❌ 단절 트레이스 {len(traces)}개 발견!")
                for t in traces[:5]:  # 최대 5개만 출력
                    dur = format_duration(t.get("durationMs", 0))
                    print(f"     TraceID: {t['traceID']}  Duration: {dur}  "
                          f"Root: {t.get('rootTraceName', 'unknown')}")
                    results["broken_traces"].append({
                        "check": q["name"],
                        "trace_id": t["traceID"],
                        "duration_ms": t.get("durationMs"),
                        "root_name": t.get("rootTraceName"),
                    })
            else:
                print(f"  ✅ 단절 없음")

        # 2. 성능 이상 탐지
        print(f"\n── 2. 성능 이상 및 SLO 위반 탐지 ───────────────────────")
        total_anomalies = 0

        for q in ANOMALY_QUERIES:
            print(f"\n  검사: {q['name']}")
            traces = await query_tempo(client, tempo_url, q["query"], start, now, limit=50)
            severity = q.get("severity", "info")
            icon = {"critical": "🔴", "warning": "⚠️", "info": "ℹ️"}.get(severity, "•")

            if traces:
                total_anomalies += len(traces)
                print(f"  {icon} [{severity.upper()}] {len(traces)}개 트레이스 발견")
                for t in traces[:3]:
                    dur = format_duration(t.get("durationMs", 0))
                    print(f"     TraceID: {t['traceID']}  Duration: {dur}")
                results["anomalies"].append({
                    "check": q["name"],
                    "severity": severity,
                    "count": len(traces),
                    "sample_trace_ids": [t["traceID"] for t in traces[:3]],
                })
            else:
                print(f"  ✅ 해당 없음")

    # 최종 결과
    results["summary"]["broken_count"] = total_broken
    results["summary"]["anomaly_count"] = total_anomalies
    results["summary"]["status"] = "FAIL" if total_broken > 0 else "PASS"

    print(f"\n{'='*60}")
    print(f"  검증 결과 요약")
    print(f"  Context Propagation 단절: {total_broken}건")
    print(f"  성능 이상 탐지:           {total_anomalies}건")
    status_icon = "❌ FAIL" if total_broken > 0 else "✅ PASS"
    print(f"  최종 상태:               {status_icon}")
    print(f"{'='*60}\n")

    if output_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))

    return results


def main():
    parser = argparse.ArgumentParser(
        description="AI 서비스 분산 추적 Context Propagation 검증 도구"
    )
    parser.add_argument(
        "--tempo-url", default=TEMPO_URL_DEFAULT,
        help=f"Grafana Tempo URL (기본값: {TEMPO_URL_DEFAULT})"
    )
    parser.add_argument(
        "--hours", type=int, default=6,
        help="검사할 과거 시간 범위 (기본값: 6시간)"
    )
    parser.add_argument(
        "--fail-on-broken", action="store_true",
        help="단절 트레이스 발견 시 exit code 1로 종료 (CI 연동용)"
    )
    parser.add_argument(
        "--json", action="store_true", dest="output_json",
        help="결과를 JSON으로 출력"
    )
    args = parser.parse_args()

    results = asyncio.run(
        run_validation(
            tempo_url=args.tempo_url,
            hours=args.hours,
            fail_on_broken=args.fail_on_broken,
            output_json=args.output_json,
        )
    )

    if args.fail_on_broken and results["summary"]["broken_count"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
