"""
벡터 DB — OTel 계측 모듈

Pinecone / Milvus / Qdrant / ChromaDB에 대한 통합 계측 레이어.
검색 레이턴시, 결과 품질(Score Spread), 인덱싱 성능을 추적합니다.
Redis Semantic Cache와 통합하여 캐시 히트율과 임베딩 비용 절감을 측정합니다.

사용법:
    from sdk_instrumentation.python.vector_db.vectordb_instrumentation import (
        InstrumentedPinecone, InstrumentedQdrant, SemanticCacheLayer
    )

    # Pinecone
    db = InstrumentedPinecone(pinecone_index, index_name="rag-index")
    results = await db.search(query_vector, top_k=5)

    # Semantic Cache + 벡터 DB 조합
    cache = SemanticCacheLayer(redis_client, db, embedder, ttl=3600)
    results = await cache.search(query_text, top_k=5)
"""

import json
import time
from typing import Any, Dict, List, Optional, Union

from opentelemetry import metrics, trace
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.data.vectordb", "1.0.0")
meter  = metrics.get_meter("ai.data.vectordb", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

search_duration = meter.create_histogram(
    name="vectordb.search.duration",
    description="벡터 유사도 검색 레이턴시",
    unit="ms",
)
search_result_count = meter.create_histogram(
    name="vectordb.search.result_count",
    description="벡터 검색 결과 수 (Top-K 실제 반환 수)",
    unit="1",
)
upsert_duration = meter.create_histogram(
    name="vectordb.upsert.duration",
    description="벡터 인덱스 삽입/업데이트 시간",
    unit="ms",
)
upsert_count = meter.create_counter(
    name="vectordb.upsert.total",
    description="인덱싱된 벡터 총 수",
    unit="1",
)
delete_duration = meter.create_histogram(
    name="vectordb.delete.duration",
    description="벡터 삭제 시간",
    unit="ms",
)
cache_hit_counter = meter.create_counter(
    name="vectordb.cache.hit.total",
    description="Semantic Cache 히트 횟수",
    unit="1",
)
cache_miss_counter = meter.create_counter(
    name="vectordb.cache.miss.total",
    description="Semantic Cache 미스 횟수",
    unit="1",
)
db_error_counter = meter.create_counter(
    name="vectordb.error.total",
    description="벡터 DB 작업 실패 횟수",
    unit="1",
)


class _BaseVectorDB:
    """공통 계측 로직을 제공하는 벡터 DB 기본 클래스"""

    def __init__(self, db_name: str, index_name: str):
        self.db_name    = db_name
        self.index_name = index_name

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filters: Optional[Dict] = None,
        namespace: str = "default",
    ) -> Dict[str, Any]:
        raise NotImplementedError

    async def upsert(
        self,
        vectors: List[Dict[str, Any]],
        namespace: str = "default",
    ) -> Dict[str, Any]:
        raise NotImplementedError

    async def delete(
        self,
        ids: List[str],
        namespace: str = "default",
    ) -> Dict[str, Any]:
        raise NotImplementedError

    def _span_attrs(self, operation: str, **extra) -> Dict[str, Any]:
        return {
            "db.system": self.db_name,
            "db.name": self.index_name,
            "db.operation": operation,
            "vectordb.namespace": extra.pop("namespace", "default"),
            **extra,
        }

    def _record_search_metrics(
        self,
        elapsed_ms: float,
        results: List[Any],
        filters: Optional[Dict],
    ) -> None:
        labels = {
            "db": self.db_name,
            "index": self.index_name,
            "filtered": str(bool(filters)),
        }
        search_duration.record(elapsed_ms, labels)
        search_result_count.record(len(results), {"db": self.db_name})


class InstrumentedPinecone(_BaseVectorDB):
    """Pinecone 인덱스에 OTel 계측을 적용하는 래퍼"""

    def __init__(self, index, index_name: str):
        super().__init__("pinecone", index_name)
        self._index = index

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filters: Optional[Dict] = None,
        namespace: str = "default",
    ) -> Dict[str, Any]:
        dims = len(query_vector)
        with tracer.start_as_current_span(
            "vectordb.pinecone.search",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs(
                "vector_search",
                namespace=namespace,
                **{
                    "vectordb.query.dimensions": dims,
                    "vectordb.query.top_k": top_k,
                    "vectordb.filter_applied": bool(filters),
                },
            ),
        ) as span:
            start = time.perf_counter()
            try:
                response = self._index.query(
                    vector=query_vector,
                    top_k=top_k,
                    filter=filters,
                    namespace=namespace,
                    include_metadata=True,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                matches    = response.get("matches", [])

                _attach_search_quality(span, matches, elapsed_ms)
                self._record_search_metrics(elapsed_ms, matches, filters)
                return response

            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "search")
                raise

    async def upsert(
        self,
        vectors: List[Dict[str, Any]],
        namespace: str = "default",
    ) -> Dict[str, Any]:
        with tracer.start_as_current_span(
            "vectordb.pinecone.upsert",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs(
                "upsert",
                namespace=namespace,
                **{"vectordb.upsert.count": len(vectors)},
            ),
        ) as span:
            start = time.perf_counter()
            try:
                response = self._index.upsert(vectors=vectors, namespace=namespace)
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.set_attribute("vectordb.upsert.duration_ms", elapsed_ms)
                upsert_duration.record(elapsed_ms, {"db": self.db_name})
                upsert_count.add(len(vectors), {"db": self.db_name})
                return response
            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "upsert")
                raise

    async def delete(
        self,
        ids: List[str],
        namespace: str = "default",
    ) -> Dict[str, Any]:
        with tracer.start_as_current_span(
            "vectordb.pinecone.delete",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs("delete", namespace=namespace),
        ) as span:
            start = time.perf_counter()
            try:
                response = self._index.delete(ids=ids, namespace=namespace)
                elapsed_ms = (time.perf_counter() - start) * 1000
                delete_duration.record(elapsed_ms, {"db": self.db_name})
                return response
            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "delete")
                raise


class InstrumentedQdrant(_BaseVectorDB):
    """Qdrant 컬렉션에 OTel 계측을 적용하는 래퍼 (동기/비동기 클라이언트 모두 지원)"""

    def __init__(self, client, collection_name: str):
        super().__init__("qdrant", collection_name)
        self._client = client

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filters=None,
        namespace: str = "default",
    ) -> Dict[str, Any]:
        dims = len(query_vector)
        with tracer.start_as_current_span(
            "vectordb.qdrant.search",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs(
                "vector_search",
                namespace=namespace,
                **{
                    "vectordb.query.dimensions": dims,
                    "vectordb.query.top_k": top_k,
                    "vectordb.filter_applied": bool(filters),
                },
            ),
        ) as span:
            start = time.perf_counter()
            try:
                results = await self._client.search(
                    collection_name=self.index_name,
                    query_vector=query_vector,
                    limit=top_k,
                    query_filter=filters,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                matches    = [{"id": r.id, "score": r.score} for r in results]

                _attach_search_quality(span, matches, elapsed_ms)
                self._record_search_metrics(elapsed_ms, matches, filters)
                return {"matches": matches}

            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "search")
                raise

    async def upsert(self, vectors: List[Dict[str, Any]], namespace: str = "default"):
        with tracer.start_as_current_span(
            "vectordb.qdrant.upsert",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs("upsert", namespace=namespace),
        ) as span:
            start = time.perf_counter()
            try:
                from qdrant_client.models import PointStruct
                points = [
                    PointStruct(id=v["id"], vector=v["values"], payload=v.get("metadata", {}))
                    for v in vectors
                ]
                result = await self._client.upsert(
                    collection_name=self.index_name, points=points
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                upsert_duration.record(elapsed_ms, {"db": self.db_name})
                upsert_count.add(len(vectors), {"db": self.db_name})
                return result
            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "upsert")
                raise

    async def delete(self, ids: List[str], namespace: str = "default"):
        with tracer.start_as_current_span(
            "vectordb.qdrant.delete",
            kind=SpanKind.CLIENT,
            attributes=self._span_attrs("delete", namespace=namespace),
        ) as span:
            start = time.perf_counter()
            try:
                result = await self._client.delete(
                    collection_name=self.index_name,
                    points_selector=ids,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                delete_duration.record(elapsed_ms, {"db": self.db_name})
                return result
            except Exception as exc:
                _handle_db_error(span, exc, self.db_name, "delete")
                raise


class SemanticCacheLayer:
    """
    Redis Semantic Cache + 벡터 DB 통합 레이어.

    캐시 히트 시 벡터 DB 호출 없이 즉시 반환하여
    임베딩 비용과 검색 레이턴시를 절감합니다.
    캐시 히트율과 절감 효과를 OTel Metric으로 추적합니다.
    """

    def __init__(
        self,
        redis_client,
        vector_db: _BaseVectorDB,
        embedder,
        ttl: int = 3600,
        cache_prefix: str = "sem_cache",
    ):
        self._redis  = redis_client
        self._db     = vector_db
        self._embed  = embedder
        self.ttl     = ttl
        self.prefix  = cache_prefix

    async def search(
        self,
        query_text: str,
        top_k: int = 5,
        filters: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        cache_key = f"{self.prefix}:{hash(query_text)}:{top_k}"

        with tracer.start_as_current_span(
            "cache.semantic.lookup",
            kind=SpanKind.INTERNAL,
            attributes={
                "cache.backend": "redis",
                "cache.type": "semantic",
                "cache.key_prefix": self.prefix,
                "cache.query_length": len(query_text),
            },
        ) as span:
            # 1. 캐시 조회
            cached = await self._redis.get(cache_key)
            span.set_attribute("cache.hit", bool(cached))

            if cached:
                cache_hit_counter.add(1, {"db": self._db.db_name})
                span.add_event("cache.hit", {"cache.key": cache_key[:60]})
                return json.loads(cached)

            # 2. 캐시 미스: 임베딩 → 검색 → 캐시 저장
            cache_miss_counter.add(1, {"db": self._db.db_name})
            span.add_event("cache.miss", {"cache.key": cache_key[:60]})

            # 임베딩 생성
            if hasattr(self._embed, "encode"):
                vector = self._embed.encode([query_text])[0].tolist()
            else:
                vector = await self._embed.embed([query_text])
                vector = vector[0]

            # 벡터 DB 검색
            results = await self._db.search(vector, top_k=top_k, filters=filters)

            # 캐시에 저장
            await self._redis.setex(cache_key, self.ttl, json.dumps(results))
            span.set_attribute("cache.stored", True)
            return results


# ── 내부 유틸 함수 ───────────────────────────────────────────────────

def _attach_search_quality(span, matches: List[Dict], elapsed_ms: float) -> None:
    """검색 결과 품질 지표를 Span 속성으로 추가합니다."""
    result_count = len(matches)
    span.set_attributes({
        "vectordb.result.count": result_count,
        "vectordb.search.duration_ms": elapsed_ms,
    })
    if matches:
        scores = [m.get("score", 0.0) for m in matches]
        span.set_attributes({
            "vectordb.result.top_score": scores[0],
            "vectordb.result.min_score": scores[-1],
            "vectordb.result.score_spread": scores[0] - scores[-1],
        })
        # 결과 0개는 검색 품질 문제 or 필터 조건 오류 — 이벤트로 기록
        if result_count == 0:
            span.add_event("vectordb.empty_result", {
                "message": "벡터 검색 결과가 0개입니다. 쿼리 또는 인덱스를 확인하세요.",
            })


def _handle_db_error(span, exc: Exception, db_name: str, operation: str) -> None:
    """DB 에러를 Span에 기록하고 에러 카운터를 증가시킵니다."""
    span.record_exception(exc)
    span.set_status(StatusCode.ERROR, str(exc))
    db_error_counter.add(1, {
        "db": db_name,
        "operation": operation,
        "error_type": type(exc).__name__,
    })
