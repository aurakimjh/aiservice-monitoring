"""Document Management Router"""

from typing import List

from fastapi import APIRouter, HTTPException

from app.models import DocumentUploadRequest, DocumentInfo

router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.post("/upload", response_model=dict)
async def upload_document(req: DocumentUploadRequest):
    """문서를 벡터 스토어에 업로드"""
    from app.main import rag_service

    await rag_service.load_documents([{"content": req.content, "source": req.source}])
    return {
        "status": "ok",
        "message": f"문서 '{req.source}' 업로드 완료",
        "total_documents": rag_service.vector_store.count,
    }


@router.get("/list", response_model=dict)
async def list_documents():
    """적재된 문서 수 확인"""
    from app.main import rag_service
    return {
        "total_chunks": rag_service.vector_store.count,
    }
