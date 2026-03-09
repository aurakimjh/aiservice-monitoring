"""RAG Pipeline Orchestrator"""

import time
from typing import AsyncGenerator

from opentelemetry import trace

from app.instrumentation.otel_setup import get_tracer
from app.instrumentation import metrics as m
from app.models import ChatRequest, ChatResponse, SourceDocument, ResponseMetrics
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import VectorStore
from app.services.llm_service import LLMService
from app.services.guardrail_service import GuardrailService
from app.config import settings

_tracer = get_tracer("rag-pipeline")


class RAGService:
    """RAG 파이프라인 전체 오케스트레이션

    처리 흐름:
    1. 입력 가드레일 검사
    2. 사용자 질문 임베딩
    3. 벡터 스토어 유사 문서 검색
    4. LLM 프롬프트 구성 및 추론
    5. 출력 가드레일 검사
    6. 응답 반환
    """

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStore()
        self.llm_service = LLMService()
        self.guardrail_service = GuardrailService()

    async def load_documents(self, docs: list[dict]):
        """문서를 임베딩하여 벡터 스토어에 적재"""
        for doc in docs:
            chunks = self._chunk_text(doc["content"], chunk_size=300, overlap=50)
            for chunk in chunks:
                embedding = await self.embedding_service.embed(chunk)
                self.vector_store.add_document(chunk, doc["source"], embedding)

    async def query(self, request: ChatRequest) -> ChatResponse:
        """RAG 파이프라인 실행 (동기 응답)"""
        with _tracer.start_as_current_span("rag.pipeline") as span:
            pipeline_start = time.perf_counter()
            m.request_total.add(1)

            span.set_attribute("rag.question_length", len(request.question))
            span.set_attribute("rag.use_rag", request.use_rag)
            span.set_attribute("rag.session_id", request.session_id or "")

            # 1. 입력 가드레일
            action, reason = await self.guardrail_service.check_input(request.question)
            if action == "BLOCK":
                span.set_attribute("rag.blocked", True)
                return ChatResponse(
                    answer=f"요청이 안전 정책에 의해 차단되었습니다: {reason}",
                    sources=[],
                    trace_id=self._get_trace_id(),
                    metrics=ResponseMetrics(ttft_ms=0, total_time_ms=0, tokens_generated=0, tps=0),
                )

            # 2-3. RAG 문서 검색
            context = ""
            sources = []
            if request.use_rag:
                query_embedding = await self.embedding_service.embed(request.question)
                results = await self.vector_store.search(
                    query_embedding,
                    top_k=settings.vector_top_k,
                    threshold=settings.similarity_threshold,
                )
                sources = [
                    SourceDocument(content=doc["content"], source=doc["source"], similarity_score=round(score, 4))
                    for doc, score in results
                ]
                context = "\n\n---\n\n".join(doc["content"] for doc, _ in results)
                span.set_attribute("rag.documents_found", len(results))

            # 4. LLM 추론
            llm_result = await self.llm_service.generate(request.question, context)

            # 5. 출력 가드레일
            await self.guardrail_service.check_output(llm_result["answer"])

            total_ms = (time.perf_counter() - pipeline_start) * 1000
            span.set_attribute("rag.total_time_ms", round(total_ms, 2))

            return ChatResponse(
                answer=llm_result["answer"],
                sources=sources,
                trace_id=self._get_trace_id(),
                metrics=ResponseMetrics(
                    ttft_ms=llm_result["ttft_ms"],
                    total_time_ms=round(total_ms, 2),
                    tokens_generated=llm_result["tokens_generated"],
                    tps=llm_result["tps"],
                ),
            )

    async def query_stream(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        """RAG 파이프라인 실행 (스트리밍 응답)"""
        with _tracer.start_as_current_span("rag.pipeline_stream") as span:
            m.request_total.add(1)

            # 1. 입력 가드레일
            action, reason = await self.guardrail_service.check_input(request.question)
            if action == "BLOCK":
                yield f"[BLOCKED] {reason}"
                return

            # 2-3. RAG 문서 검색
            context = ""
            if request.use_rag:
                query_embedding = await self.embedding_service.embed(request.question)
                results = await self.vector_store.search(
                    query_embedding,
                    top_k=settings.vector_top_k,
                    threshold=settings.similarity_threshold,
                )
                context = "\n\n---\n\n".join(doc["content"] for doc, _ in results)
                span.set_attribute("rag.documents_found", len(results))

            # 4. LLM 스트리밍 추론
            async for chunk in self.llm_service.generate_stream(request.question, context):
                yield chunk

    def _chunk_text(self, text: str, chunk_size: int = 300, overlap: int = 50) -> list[str]:
        """텍스트를 겹치는 청크로 분할"""
        words = text.split()
        chunks = []
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)
        return chunks

    def _get_trace_id(self) -> str:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            return format(ctx.trace_id, '032x')
        return ""
