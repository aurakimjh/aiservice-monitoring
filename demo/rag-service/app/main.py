"""RAG Demo Service — FastAPI Application Entry Point"""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.instrumentation.otel_setup import setup_otel
from app.services.rag_service import RAGService

# ── 전역 RAG 서비스 인스턴스 ───────────────────────────────────
rag_service = RAGService()

# ── OTel 초기화 (앱 생성 전에 실행) ───────────────────────────
tracer_provider = setup_otel()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 시작/종료 시 실행되는 컨텍스트"""

    # ── Startup ────────────────────────────────────────────────
    # 샘플 문서 로드
    sample_dir = Path(__file__).parent / "sample_docs"
    if sample_dir.exists():
        docs = []
        for f in sample_dir.glob("*.txt"):
            content = f.read_text(encoding="utf-8")
            docs.append({"content": content, "source": f.name})
        if docs:
            await rag_service.load_documents(docs)
            print(f"[Startup] {len(docs)}개 샘플 문서 로드 완료 "
                  f"(총 {rag_service.vector_store.count}개 청크)")

    print(f"[Startup] RAG Demo Service 시작 (mock_mode={settings.mock_mode})")

    yield

    # ── Shutdown ───────────────────────────────────────────────
    if tracer_provider:
        tracer_provider.force_flush()
        tracer_provider.shutdown()
    print("[Shutdown] RAG Demo Service 종료")


# ── FastAPI 앱 생성 ────────────────────────────────────────────
app = FastAPI(
    title="RAG Demo Service",
    description="OpenTelemetry 계측이 적용된 RAG 서비스 데모. "
                "aiservice-monitoring 솔루션으로 성능 모니터링을 확인할 수 있습니다.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (XLog 대시보드 및 개발 환경 접근)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── FastAPI 자동 계측 (앱 생성 후, 서버 시작 전) ─────────────
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
FastAPIInstrumentor.instrument_app(app)

# ── 라우터 등록 ────────────────────────────────────────────────
from app.routers import chat, documents, health
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(health.router)


@app.get("/")
async def root():
    return {
        "service": settings.service_name,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
