"""LLM Service — Mock or OpenAI compatible"""

import asyncio
import random
import time
from typing import AsyncGenerator

from opentelemetry import trace

from app.config import settings
from app.instrumentation.rag_tracer import trace_rag_step
from app.instrumentation.otel_setup import get_tracer
from app.instrumentation import metrics as m

_tracer = get_tracer("llm-service")

# Mock 응답 템플릿 (한국어)
MOCK_RESPONSES = [
    "네, 질문에 대해 답변드리겠습니다. {context}를 기반으로 살펴보면, "
    "해당 내용은 다음과 같습니다. 먼저 관련 정책에 따르면 주요 사항은 "
    "업무 효율성과 직원 복지를 동시에 고려하여 설계되었습니다. "
    "구체적으로는 각 부서의 상황에 맞게 유연하게 적용할 수 있으며, "
    "필요한 경우 인사팀에 추가 문의하시면 상세한 안내를 받으실 수 있습니다.",

    "검색된 문서를 분석한 결과, {context} 관련하여 다음과 같이 정리해 드립니다. "
    "핵심 내용은 세 가지로 요약됩니다. 첫째, 기본 원칙에 따라 처리됩니다. "
    "둘째, 예외 사항이 있을 수 있으므로 구체적인 상황을 확인해야 합니다. "
    "셋째, 관련 부서와 협의하여 최종 결정을 내리는 것이 좋습니다. "
    "추가적인 질문이 있으시면 언제든 물어보세요.",

    "좋은 질문입니다. {context}에 대해 설명드리겠습니다. "
    "이 기능은 사용자의 편의를 위해 설계되었으며, "
    "주요 단계는 다음과 같습니다: 1) 시스템에 접속합니다. "
    "2) 필요한 정보를 입력합니다. 3) 확인 버튼을 클릭합니다. "
    "4) 처리 결과를 확인합니다. 각 단계에서 도움이 필요하시면 "
    "사용자 가이드를 참고하시거나 기술 지원팀에 문의해 주세요.",
]


class LLMService:
    """LLM 추론 서비스 (Mock 모드 또는 OpenAI API)"""

    def __init__(self):
        self.mock_mode = settings.mock_mode

    @trace_rag_step("llm_inference")
    async def generate(self, prompt: str, context: str = "") -> dict:
        """동기 응답 생성"""
        span = trace.get_current_span()
        start = time.perf_counter()

        if self.mock_mode:
            result = await self._mock_generate(prompt, context, span)
        else:
            result = await self._openai_generate(prompt, context, span)

        total_ms = (time.perf_counter() - start) * 1000
        m.request_duration.record(total_ms)
        return result

    async def generate_stream(self, prompt: str, context: str = "") -> AsyncGenerator[str, None]:
        """SSE 스트리밍 응답 생성"""
        with _tracer.start_as_current_span("rag.llm_inference_stream") as span:
            if self.mock_mode:
                async for chunk in self._mock_stream(prompt, context, span):
                    yield chunk
            else:
                async for chunk in self._openai_stream(prompt, context, span):
                    yield chunk

    async def _mock_generate(self, prompt: str, context: str, span) -> dict:
        """Mock 동기 응답"""
        template = random.choice(MOCK_RESPONSES)
        answer = template.format(context=context[:50] if context else "제공된 문서")

        # TTFT 시뮬레이션 (80-400ms)
        ttft_ms = 80 + random.random() * 320
        await asyncio.sleep(ttft_ms / 1000)

        # 토큰 생성 시뮬레이션
        tokens = answer.split()
        token_count = len(tokens)
        gen_time_ms = token_count * (15 + random.random() * 25)  # 15-40ms/token
        await asyncio.sleep(gen_time_ms / 1000)

        total_ms = ttft_ms + gen_time_ms
        tps = (token_count / (total_ms / 1000)) if total_ms > 0 else 0

        # Span attributes
        span.set_attribute("llm.model", "mock-model")
        span.set_attribute("llm.ttft_ms", round(ttft_ms, 2))
        span.set_attribute("llm.tokens_generated", token_count)
        span.set_attribute("llm.tokens_per_second", round(tps, 2))
        span.set_attribute("llm.prompt_tokens", len(prompt.split()))

        # Metrics
        m.ttft_duration.record(ttft_ms)
        m.tokens_per_second.record(tps)

        return {
            "answer": answer,
            "ttft_ms": round(ttft_ms, 2),
            "total_time_ms": round(total_ms, 2),
            "tokens_generated": token_count,
            "tps": round(tps, 2),
        }

    async def _mock_stream(self, prompt: str, context: str, span) -> AsyncGenerator[str, None]:
        """Mock 스트리밍 응답"""
        template = random.choice(MOCK_RESPONSES)
        answer = template.format(context=context[:50] if context else "제공된 문서")
        tokens = answer.split()

        # TTFT
        ttft_ms = 80 + random.random() * 320
        await asyncio.sleep(ttft_ms / 1000)
        span.set_attribute("llm.ttft_ms", round(ttft_ms, 2))
        m.ttft_duration.record(ttft_ms)

        start = time.perf_counter()
        for i, token in enumerate(tokens):
            delay = 0.015 + random.random() * 0.035  # 15-50ms per token
            await asyncio.sleep(delay)
            yield token + (" " if i < len(tokens) - 1 else "")

        gen_ms = (time.perf_counter() - start) * 1000
        tps = len(tokens) / (gen_ms / 1000) if gen_ms > 0 else 0
        span.set_attribute("llm.tokens_generated", len(tokens))
        span.set_attribute("llm.tokens_per_second", round(tps, 2))
        m.tokens_per_second.record(tps)

    async def _openai_generate(self, prompt: str, context: str, span) -> dict:
        """OpenAI API 동기 호출"""
        import httpx

        messages = self._build_messages(prompt, context)
        start = time.perf_counter()

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": settings.openai_model, "messages": messages},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()

        total_ms = (time.perf_counter() - start) * 1000
        answer = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        token_count = usage.get("completion_tokens", len(answer.split()))

        span.set_attribute("llm.model", settings.openai_model)
        span.set_attribute("llm.tokens_generated", token_count)
        span.set_attribute("llm.prompt_tokens", usage.get("prompt_tokens", 0))

        return {
            "answer": answer,
            "ttft_ms": round(total_ms * 0.15, 2),
            "total_time_ms": round(total_ms, 2),
            "tokens_generated": token_count,
            "tps": round(token_count / (total_ms / 1000), 2) if total_ms > 0 else 0,
        }

    async def _openai_stream(self, prompt: str, context: str, span) -> AsyncGenerator[str, None]:
        """OpenAI API 스트리밍 호출"""
        import httpx

        messages = self._build_messages(prompt, context)
        start = time.perf_counter()
        first_token = True
        token_count = 0

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": settings.openai_model, "messages": messages, "stream": True},
                timeout=60.0,
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    import json
                    chunk = json.loads(line[6:])
                    delta = chunk["choices"][0].get("delta", {}).get("content", "")
                    if delta:
                        if first_token:
                            ttft_ms = (time.perf_counter() - start) * 1000
                            span.set_attribute("llm.ttft_ms", round(ttft_ms, 2))
                            m.ttft_duration.record(ttft_ms)
                            first_token = False
                        token_count += 1
                        yield delta

        total_ms = (time.perf_counter() - start) * 1000
        span.set_attribute("llm.tokens_generated", token_count)
        tps = token_count / (total_ms / 1000) if total_ms > 0 else 0
        m.tokens_per_second.record(tps)

    def _build_messages(self, prompt: str, context: str) -> list:
        system = "당신은 친절한 AI 어시스턴트입니다. 제공된 문서 컨텍스트를 기반으로 정확하게 답변하세요."
        if context:
            system += f"\n\n참고 문서:\n{context}"
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
