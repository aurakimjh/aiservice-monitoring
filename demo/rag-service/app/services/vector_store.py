"""In-memory Vector Store with Cosine Similarity"""

import time
from typing import List, Tuple

import numpy as np

from app.instrumentation.rag_tracer import trace_rag_step
from app.instrumentation import metrics as m


class VectorStore:
    """벡터 임베딩을 메모리에 저장하고 코사인 유사도로 검색하는 경량 벡터 DB"""

    def __init__(self):
        self._embeddings: List[np.ndarray] = []
        self._documents: List[dict] = []   # {"content": str, "source": str}

    @property
    def count(self) -> int:
        return len(self._documents)

    def add_document(self, content: str, source: str, embedding: np.ndarray):
        self._embeddings.append(embedding / (np.linalg.norm(embedding) + 1e-10))
        self._documents.append({"content": content, "source": source})

    def add_documents(self, docs: List[dict], embeddings: List[np.ndarray]):
        for doc, emb in zip(docs, embeddings):
            self.add_document(doc["content"], doc["source"], emb)

    @trace_rag_step("vector_search")
    async def search(self, query_embedding: np.ndarray, top_k: int = 3,
                     threshold: float = 0.0) -> List[Tuple[dict, float]]:
        """쿼리 임베딩과 가장 유사한 문서 top_k개 반환"""
        if not self._embeddings:
            return []

        start = time.perf_counter()

        query_norm = query_embedding / (np.linalg.norm(query_embedding) + 1e-10)
        matrix = np.array(self._embeddings)
        similarities = matrix @ query_norm

        top_indices = np.argsort(similarities)[::-1][:top_k]
        results = []
        for idx in top_indices:
            score = float(similarities[idx])
            if score >= threshold:
                results.append((self._documents[idx], score))

        elapsed_ms = (time.perf_counter() - start) * 1000
        m.vector_search_duration.record(elapsed_ms)
        m.documents_retrieved.record(len(results))

        return results

    def clear(self):
        self._embeddings.clear()
        self._documents.clear()
