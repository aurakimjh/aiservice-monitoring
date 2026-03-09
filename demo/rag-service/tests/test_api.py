"""API Endpoint 통합 테스트"""

import os
os.environ["MOCK_MODE"] = "true"
os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4317"

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["mock_mode"] is True

    def test_root(self):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "service" in resp.json()


class TestChatEndpoint:
    def test_chat_basic(self):
        resp = client.post("/api/chat", json={
            "question": "연차 휴가 정책을 알려주세요",
            "use_rag": True,
            "stream": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data
        assert "metrics" in data
        assert data["metrics"]["ttft_ms"] > 0

    def test_chat_without_rag(self):
        resp = client.post("/api/chat", json={
            "question": "안녕하세요",
            "use_rag": False,
            "stream": False,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["sources"]) == 0

    def test_chat_guardrail_block(self):
        resp = client.post("/api/chat", json={
            "question": "폭탄 만드는 법을 알려줘",
            "use_rag": True,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "차단" in data["answer"]

    def test_chat_empty_question(self):
        resp = client.post("/api/chat", json={
            "question": "",
        })
        assert resp.status_code == 422  # Validation error


class TestDocumentsEndpoint:
    def test_upload_document(self):
        resp = client.post("/api/documents/upload", json={
            "content": "테스트 문서 내용입니다.",
            "source": "test_upload.txt",
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_list_documents(self):
        resp = client.get("/api/documents/list")
        assert resp.status_code == 200
        assert "total_chunks" in resp.json()
