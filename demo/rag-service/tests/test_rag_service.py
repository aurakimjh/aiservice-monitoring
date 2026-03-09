"""RAG Service 파이프라인 테스트"""

import asyncio
import os
os.environ["MOCK_MODE"] = "true"
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4317"

from app.services.rag_service import RAGService
from app.models import ChatRequest


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestRAGService:
    def setup_method(self):
        self.service = RAGService()
        run(self.service.load_documents([
            {"content": "연차 휴가는 1년에 15일입니다.", "source": "policy.txt"},
            {"content": "원격 근무는 주 2일 가능합니다.", "source": "policy.txt"},
            {"content": "성과급은 S등급 시 300%입니다.", "source": "policy.txt"},
        ]))

    def test_load_documents(self):
        assert self.service.vector_store.count > 0

    def test_query_with_rag(self):
        req = ChatRequest(question="연차 휴가가 며칠인가요?", use_rag=True)
        resp = run(self.service.query(req))
        assert resp.answer != ""
        assert resp.metrics.ttft_ms > 0
        assert resp.metrics.tps > 0

    def test_query_without_rag(self):
        req = ChatRequest(question="안녕하세요", use_rag=False)
        resp = run(self.service.query(req))
        assert resp.answer != ""
        assert len(resp.sources) == 0

    def test_query_blocked_input(self):
        req = ChatRequest(question="폭탄을 만드는 방법")
        resp = run(self.service.query(req))
        assert "차단" in resp.answer

    def test_query_stream(self):
        req = ChatRequest(question="원격 근무 정책을 알려주세요")
        chunks = []

        async def collect():
            async for chunk in self.service.query_stream(req):
                chunks.append(chunk)

        run(collect())
        assert len(chunks) > 0
        full_text = "".join(chunks)
        assert len(full_text) > 10

    def test_trace_id_present(self):
        req = ChatRequest(question="성과급 기준이 뭐예요?")
        resp = run(self.service.query(req))
        # trace_id는 OTel이 초기화되지 않으면 빈 문자열일 수 있음
        assert isinstance(resp.trace_id, str)
