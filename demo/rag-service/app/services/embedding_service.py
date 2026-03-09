"""Embedding Service — Mock or OpenAI"""

import hashlib
import time
from typing import List

import numpy as np

from app.config import settings
from app.instrumentation.rag_tracer import trace_rag_step
from app.instrumentation import metrics as m

EMBEDDING_DIM = 256


class EmbeddingService:
    """텍스트를 벡터 임베딩으로 변환 (Mock 또는 OpenAI API)"""

    def __init__(self):
        self.mock_mode = settings.mock_mode

    @trace_rag_step("embedding")
    async def embed(self, text: str) -> np.ndarray:
        start = time.perf_counter()

        if self.mock_mode:
            result = self._mock_embed(text)
        else:
            result = await self._openai_embed(text)

        elapsed_ms = (time.perf_counter() - start) * 1000
        m.embedding_duration.record(elapsed_ms)
        return result

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        return [await self.embed(t) for t in texts]

    def _mock_embed(self, text: str) -> np.ndarray:
        """해시 기반 결정적 임베딩 (테스트용)

        동일 텍스트 → 동일 벡터를 보장하며,
        유사 텍스트가 유사 벡터를 갖도록 n-gram 해싱 사용.
        """
        vec = np.zeros(EMBEDDING_DIM, dtype=np.float32)

        # 유니그램 해시
        for word in text.lower().split():
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = h % EMBEDDING_DIM
            vec[idx] += 1.0

        # 바이그램 해시 (유사도 향상)
        words = text.lower().split()
        for i in range(len(words) - 1):
            bigram = f"{words[i]}_{words[i+1]}"
            h = int(hashlib.md5(bigram.encode()).hexdigest(), 16)
            idx = h % EMBEDDING_DIM
            vec[idx] += 0.5

        # L2 정규화
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        return vec

    async def _openai_embed(self, text: str) -> np.ndarray:
        """OpenAI Embeddings API 호출"""
        import httpx

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": "text-embedding-3-small", "input": text},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return np.array(data["data"][0]["embedding"], dtype=np.float32)
