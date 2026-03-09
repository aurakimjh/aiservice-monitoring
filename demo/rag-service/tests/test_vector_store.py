"""Vector Store 단위 테스트"""

import asyncio
import numpy as np
import pytest

from app.services.vector_store import VectorStore


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestVectorStore:
    def setup_method(self):
        self.store = VectorStore()

    def test_add_and_count(self):
        emb = np.random.randn(256).astype(np.float32)
        self.store.add_document("hello world", "test.txt", emb)
        assert self.store.count == 1

    def test_search_returns_results(self):
        # 문서 추가
        doc_emb = np.zeros(256, dtype=np.float32)
        doc_emb[0] = 1.0
        self.store.add_document("test document", "test.txt", doc_emb)

        # 유사한 쿼리
        query_emb = np.zeros(256, dtype=np.float32)
        query_emb[0] = 1.0
        results = run(self.store.search(query_emb, top_k=1))

        assert len(results) == 1
        assert results[0][0]["content"] == "test document"
        assert results[0][1] > 0.9  # cosine similarity should be high

    def test_search_empty_store(self):
        query_emb = np.random.randn(256).astype(np.float32)
        results = run(self.store.search(query_emb, top_k=3))
        assert results == []

    def test_search_respects_top_k(self):
        for i in range(10):
            emb = np.random.randn(256).astype(np.float32)
            self.store.add_document(f"doc {i}", f"file{i}.txt", emb)

        query_emb = np.random.randn(256).astype(np.float32)
        results = run(self.store.search(query_emb, top_k=3))
        assert len(results) == 3

    def test_search_respects_threshold(self):
        emb = np.zeros(256, dtype=np.float32)
        emb[0] = 1.0
        self.store.add_document("test", "test.txt", emb)

        # 전혀 다른 벡터로 검색
        query = np.zeros(256, dtype=np.float32)
        query[100] = 1.0
        results = run(self.store.search(query, top_k=1, threshold=0.5))
        assert len(results) == 0  # 유사도 임계치 미달

    def test_clear(self):
        emb = np.random.randn(256).astype(np.float32)
        self.store.add_document("test", "test.txt", emb)
        assert self.store.count == 1
        self.store.clear()
        assert self.store.count == 0
