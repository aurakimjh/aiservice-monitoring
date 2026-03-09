"""RAG Demo Service — Request/Response Models"""

from typing import List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="사용자 질문")
    session_id: Optional[str] = Field(None, description="세션 식별자")
    use_rag: bool = Field(True, description="RAG 문서 검색 사용 여부")
    stream: bool = Field(False, description="SSE 스트리밍 응답 사용 여부")


class SourceDocument(BaseModel):
    content: str
    source: str
    similarity_score: float


class ResponseMetrics(BaseModel):
    ttft_ms: float = Field(description="Time To First Token (ms)")
    total_time_ms: float = Field(description="전체 응답 시간 (ms)")
    tokens_generated: int = Field(description="생성된 토큰 수")
    tps: float = Field(description="Tokens Per Second")


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceDocument] = []
    trace_id: str = ""
    metrics: ResponseMetrics


class DocumentUploadRequest(BaseModel):
    content: str = Field(..., min_length=1, description="문서 내용")
    source: str = Field(..., description="문서 출처 (파일명)")


class DocumentInfo(BaseModel):
    source: str
    chunk_count: int
    total_chars: int


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str = "1.0.0"
    documents_loaded: int = 0
    mock_mode: bool = True
