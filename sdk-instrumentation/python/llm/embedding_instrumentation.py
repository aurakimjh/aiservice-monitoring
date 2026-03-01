"""
임베딩 모델 — OTel 계측 모듈

HuggingFace Sentence Transformers(로컬 GPU) 및
OpenAI Embedding API(HTTP) 모두를 지원하는 통합 계측 레이어.
배치 크기, 처리량(tok/s), 벡터 차원수를 추적하여
임베딩 파이프라인 병목을 식별합니다.

사용법:
    # HuggingFace 로컬 모델
    from sdk_instrumentation.python.llm.embedding_instrumentation import (
        InstrumentedSentenceTransformer, InstrumentedOpenAIEmbedding
    )

    embedder = InstrumentedSentenceTransformer("BAAI/bge-m3", device="cuda")
    vectors = embedder.encode(["텍스트 목록", "..."])

    # OpenAI API
    oai_embedder = InstrumentedOpenAIEmbedding(client, model="text-embedding-3-small")
    vectors = await oai_embedder.embed(["텍스트 목록"])
"""

import time
from typing import List, Optional, Union

import numpy as np
from opentelemetry import metrics, trace
from opentelemetry.trace import SpanKind, StatusCode

tracer = trace.get_tracer("ai.model.embedding", "1.0.0")
meter  = metrics.get_meter("ai.model.embedding", "1.0.0")

# ── 메트릭 정의 ─────────────────────────────────────────────────────

embed_duration = meter.create_histogram(
    name="embedding.request.duration",
    description="임베딩 요청 처리 시간 (배치 전체)",
    unit="ms",
)
embed_batch_size = meter.create_histogram(
    name="embedding.batch_size",
    description="임베딩 배치 크기 (한 번에 처리한 텍스트 수)",
    unit="1",
)
embed_tokens_total = meter.create_counter(
    name="embedding.tokens.total",
    description="임베딩에 사용된 총 토큰 수 (비용 추적)",
    unit="tok",
)
embed_throughput = meter.create_histogram(
    name="embedding.throughput",
    description="임베딩 처리량 (토큰/초)",
    unit="tok/s",
)
embed_error_counter = meter.create_counter(
    name="embedding.error.total",
    description="임베딩 요청 실패 횟수",
    unit="1",
)


class InstrumentedSentenceTransformer:
    """
    HuggingFace SentenceTransformers 모델에 OTel 계측을 적용하는 래퍼.

    로컬 GPU 추론 시간, 배치 처리 효율, 임베딩 차원수를 추적합니다.
    """

    def __init__(
        self,
        model_name_or_path: str,
        device: str = "cuda",
        **model_kwargs,
    ):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise ImportError("pip install sentence-transformers")

        self.model_name = model_name_or_path
        self.device = device
        self._model = SentenceTransformer(model_name_or_path, device=device, **model_kwargs)

    def encode(
        self,
        sentences: Union[str, List[str]],
        batch_size: int = 32,
        normalize_embeddings: bool = True,
        **kwargs,
    ) -> np.ndarray:
        """
        텍스트를 벡터로 변환합니다.
        단일 문자열도 리스트로 정규화하여 처리합니다.
        """
        if isinstance(sentences, str):
            sentences = [sentences]

        total_tokens = sum(len(s.split()) for s in sentences)
        batch_count  = (len(sentences) + batch_size - 1) // batch_size

        with tracer.start_as_current_span(
            "embedding.encode",
            kind=SpanKind.INTERNAL,
            attributes={
                "embedding.model": self.model_name,
                "embedding.device": self.device,
                "embedding.input_count": len(sentences),
                "embedding.batch_size": batch_size,
                "embedding.batch_count": batch_count,
                "embedding.total_token_estimate": total_tokens,
                "embedding.normalize": normalize_embeddings,
            },
        ) as span:
            start = time.perf_counter()

            try:
                vectors = self._model.encode(
                    sentences,
                    batch_size=batch_size,
                    normalize_embeddings=normalize_embeddings,
                    show_progress_bar=False,
                    **kwargs,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                dims = vectors.shape[-1] if hasattr(vectors, "shape") else -1
                tps  = total_tokens / (elapsed_ms / 1000) if elapsed_ms > 0 else 0

                span.set_attributes({
                    "embedding.duration_ms": elapsed_ms,
                    "embedding.output_dims": dims,
                    "embedding.throughput_tok_per_s": round(tps, 2),
                    "embedding.ms_per_item": round(elapsed_ms / len(sentences), 2),
                })

                _record_metrics(
                    self.model_name, self.device,
                    elapsed_ms, len(sentences), total_tokens, tps,
                )
                return vectors

            except Exception as exc:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, str(exc))
                embed_error_counter.add(1, {
                    "model": self.model_name,
                    "device": self.device,
                    "error_type": type(exc).__name__,
                })
                raise


class InstrumentedOpenAIEmbedding:
    """
    OpenAI Embedding API에 OTel 계측을 적용하는 비동기 래퍼.

    API 레이턴시, 토큰 소비량(실제 API 반환값 사용)을 추적합니다.
    httpx auto-instrumentation과 함께 사용하면 HTTP Span도 자동 생성됩니다.
    """

    def __init__(self, client, model: str = "text-embedding-3-small"):
        self._client = client
        self.model = model

    async def embed(
        self,
        texts: Union[str, List[str]],
        dimensions: Optional[int] = None,
    ) -> List[List[float]]:
        """텍스트를 OpenAI API로 벡터화합니다."""
        if isinstance(texts, str):
            texts = [texts]

        # 토큰 수는 API 응답에서 실제값 사용 (추정 대신)
        estimated_tokens = sum(len(t.split()) for t in texts)

        kwargs: dict = {"model": self.model, "input": texts}
        if dimensions:
            kwargs["dimensions"] = dimensions

        with tracer.start_as_current_span(
            "embedding.openai.encode",
            kind=SpanKind.CLIENT,
            attributes={
                "embedding.model": self.model,
                "embedding.provider": "openai",
                "embedding.device": "api",
                "embedding.input_count": len(texts),
                "embedding.estimated_tokens": estimated_tokens,
            },
        ) as span:
            start = time.perf_counter()

            try:
                response = await self._client.embeddings.create(**kwargs)
                elapsed_ms = (time.perf_counter() - start) * 1000

                actual_tokens = response.usage.total_tokens
                vectors = [item.embedding for item in response.data]
                dims    = len(vectors[0]) if vectors else -1
                tps     = actual_tokens / (elapsed_ms / 1000) if elapsed_ms > 0 else 0

                span.set_attributes({
                    "embedding.duration_ms": elapsed_ms,
                    "embedding.output_dims": dims,
                    "embedding.actual_tokens": actual_tokens,
                    "embedding.throughput_tok_per_s": round(tps, 2),
                })

                _record_metrics(
                    self.model, "api",
                    elapsed_ms, len(texts), actual_tokens, tps,
                )
                return vectors

            except Exception as exc:
                elapsed_ms = (time.perf_counter() - start) * 1000
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, str(exc))
                embed_error_counter.add(1, {
                    "model": self.model,
                    "device": "api",
                    "error_type": type(exc).__name__,
                })
                raise


def instrument_embedding_fn(model_name: str, device: str = "cpu"):
    """
    기존 임베딩 함수에 OTel 계측을 주입하는 데코레이터.
    SentenceTransformer 외 커스텀 임베딩 함수에도 적용 가능합니다.

    사용법:
        @instrument_embedding_fn("custom-model", device="cuda")
        def my_embed(texts: list[str]) -> np.ndarray:
            ...
    """
    def decorator(fn):
        def wrapper(texts, *args, **kwargs):
            if isinstance(texts, str):
                texts = [texts]
            total_tokens = sum(len(t.split()) for t in texts)

            with tracer.start_as_current_span(
                f"embedding.custom.{model_name}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "embedding.model": model_name,
                    "embedding.device": device,
                    "embedding.input_count": len(texts),
                    "embedding.total_token_estimate": total_tokens,
                },
            ) as span:
                start = time.perf_counter()
                try:
                    result = fn(texts, *args, **kwargs)
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    dims = result.shape[-1] if hasattr(result, "shape") else -1
                    tps  = total_tokens / (elapsed_ms / 1000) if elapsed_ms > 0 else 0

                    span.set_attributes({
                        "embedding.duration_ms": elapsed_ms,
                        "embedding.output_dims": dims,
                        "embedding.throughput_tok_per_s": round(tps, 2),
                    })
                    _record_metrics(model_name, device, elapsed_ms, len(texts), total_tokens, tps)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_status(StatusCode.ERROR, str(exc))
                    embed_error_counter.add(1, {"model": model_name, "error_type": type(exc).__name__})
                    raise
        return wrapper
    return decorator


def _record_metrics(
    model: str,
    device: str,
    elapsed_ms: float,
    item_count: int,
    token_count: int,
    throughput: float,
) -> None:
    """내부 공통 메트릭 기록 함수"""
    labels = {"model": model, "device": device}
    embed_duration.record(elapsed_ms, labels)
    embed_batch_size.record(item_count, {"model": model})
    embed_tokens_total.add(token_count, {"model": model})
    embed_throughput.record(throughput, labels)
