"""Simple keyword-based Guardrail for demo"""

import time
from typing import Tuple

from opentelemetry import trace

from app.instrumentation.rag_tracer import trace_rag_step
from app.instrumentation import metrics as m

# 차단 키워드 목록
BLOCKED_KEYWORDS = [
    # 위험 콘텐츠 (한국어)
    "폭탄", "해킹", "마약", "자살", "살인", "테러",
    # 위험 콘텐츠 (영어)
    "bomb", "hack password", "illegal", "weapon",
    # 프롬프트 인젝션 패턴
    "ignore previous", "ignore all instructions", "system prompt",
    "이전 지시 무시", "시스템 프롬프트",
]

# 출력 검사 패턴 (환각 마커)
HALLUCINATION_MARKERS = [
    "I don't have information about that",
    "As an AI language model",
    "확인되지 않은 정보",
]


class GuardrailService:
    """입력/출력 안전 검사 서비스"""

    @trace_rag_step("guardrail_input_check")
    async def check_input(self, text: str) -> Tuple[str, str]:
        """입력 가드레일 검사.

        Returns:
            (action, reason): action은 "PASS" 또는 "BLOCK"
        """
        start = time.perf_counter()
        span = trace.get_current_span()

        text_lower = text.lower()
        for keyword in BLOCKED_KEYWORDS:
            if keyword.lower() in text_lower:
                action, reason = "BLOCK", f"차단 키워드 감지: {keyword}"
                span.set_attribute("guardrail.action", action)
                span.set_attribute("guardrail.policy", "input_safety")
                span.set_attribute("guardrail.blocked_keyword", keyword)
                m.guardrail_block_total.add(1, {"policy": "input_safety"})
                elapsed = (time.perf_counter() - start) * 1000
                m.guardrail_check_duration.record(elapsed)
                return action, reason

        action, reason = "PASS", ""
        span.set_attribute("guardrail.action", action)
        span.set_attribute("guardrail.policy", "input_safety")
        elapsed = (time.perf_counter() - start) * 1000
        m.guardrail_check_duration.record(elapsed)
        return action, reason

    @trace_rag_step("guardrail_output_check")
    async def check_output(self, text: str) -> Tuple[str, str]:
        """출력 가드레일 검사"""
        start = time.perf_counter()
        span = trace.get_current_span()

        for marker in HALLUCINATION_MARKERS:
            if marker.lower() in text.lower():
                action, reason = "WARN", f"환각 마커 감지: {marker}"
                span.set_attribute("guardrail.action", action)
                span.set_attribute("guardrail.policy", "output_safety")
                elapsed = (time.perf_counter() - start) * 1000
                m.guardrail_check_duration.record(elapsed)
                return action, reason

        action, reason = "PASS", ""
        span.set_attribute("guardrail.action", action)
        span.set_attribute("guardrail.policy", "output_safety")
        elapsed = (time.perf_counter() - start) * 1000
        m.guardrail_check_duration.record(elapsed)
        return action, reason
