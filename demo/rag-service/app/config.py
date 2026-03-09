"""RAG Demo Service — Configuration"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Service
    service_name: str = "rag-demo-service"
    deployment_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000

    # OTel
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"

    # LLM
    mock_mode: bool = True
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Vector Search
    vector_top_k: int = 3
    similarity_threshold: float = 0.3

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
