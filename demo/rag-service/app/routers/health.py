"""Health Check Router"""

from fastapi import APIRouter

from app.models import HealthResponse
from app.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    from app.main import rag_service
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        documents_loaded=rag_service.vector_store.count,
        mock_mode=settings.mock_mode,
    )
