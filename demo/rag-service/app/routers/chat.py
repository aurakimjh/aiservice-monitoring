"""Chat Router — Sync + SSE Streaming"""

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models import ChatRequest, ChatResponse

router = APIRouter(prefix="/api", tags=["Chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """RAG 기반 질문 응답 (동기)"""
    from app.main import rag_service

    if req.stream:
        return StreamingResponse(
            _stream_response(req),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return await rag_service.query(req)


async def _stream_response(req: ChatRequest):
    """SSE 스트리밍 응답 생성기"""
    from app.main import rag_service

    async for chunk in rag_service.query_stream(req):
        data = json.dumps({"chunk": chunk}, ensure_ascii=False)
        yield f"data: {data}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """RAG 기반 질문 응답 (SSE 스트리밍 전용)"""
    from app.main import rag_service

    return StreamingResponse(
        _stream_response(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
