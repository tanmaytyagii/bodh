"""Environment-based configuration.

Every setting can be supplied as an environment variable (or in a `.env` file at
the repository root or in `backend/`). Nothing here assumes that an API key
exists: features that need a credential report a clear error at call time.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Storage -----------------------------------------------------------
    # "postgres" is the production store (pgvector + full-text search).
    # "memory" loads the processed corpus from disk; useful for tests and for
    # trying the app without Docker.
    retrieval_backend: Literal["postgres", "memory"] = "postgres"
    database_url: str = "postgresql://wisdom:wisdom@localhost:54329/wisdom"

    # --- Embeddings ----------------------------------------------------------
    # "local" runs an ONNX model in-process (no API key, works offline after
    # the first download). "openai" and "ollama" call an embeddings endpoint.
    embedding_provider: Literal["local", "openai", "ollama"] = "local"
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_cache_dir: Path = BACKEND_DIR / ".cache" / "fastembed"
    embedding_base_url: str | None = None
    embedding_api_key: str | None = None
    # Append editorial theme names to passage text before embedding. Helps
    # BAAI/bge-small-en-v1.5, hurts multilingual-e5 (see docs/EVALUATION.md).
    embedding_with_themes: bool = False

    # --- Language model ------------------------------------------------------
    # "anthropic" uses the Anthropic Messages API. "openai" works with any
    # OpenAI-compatible endpoint (OpenAI, Ollama, Groq, OpenRouter, vLLM, ...)
    # via LLM_BASE_URL. "none" disables generation: the API still retrieves
    # and returns verified passages, and says plainly that no guidance was
    # generated.
    llm_provider: Literal["anthropic", "openai", "none"] = "anthropic"
    llm_model: str = "claude-opus-5-5"
    # Model for the problem-understanding step; defaults to llm_model. Set a
    # faster model (e.g. claude-haiku-5-5) here to trade quality for latency.
    llm_fast_model: str | None = None
    # Reasoning effort per step (Anthropic: low | medium | high | xhigh | max).
    llm_understand_effort: str = "low"
    llm_answer_effort: str = "medium"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    llm_timeout_seconds: float = 180.0
    llm_understand_max_tokens: int = 8000
    llm_max_output_tokens: int = 16000
    # Anthropic only: retry a safety-classifier refusal on Anthropic's
    # recommended fallback model instead of failing the request.
    llm_refusal_fallbacks: bool = True
    # Some OpenAI-compatible servers do not support JSON-schema constrained
    # output; "json_object" falls back to plain JSON mode plus validation.
    llm_json_mode: Literal["json_schema", "json_object"] = "json_schema"

    # --- Retrieval tuning ------------------------------------------------------
    retrieval_candidates_per_channel: int = 30
    retrieval_top_k: int = 8
    rrf_k: int = 60
    # Weight of semantic search on the user's raw wording (rewritten queries
    # from the language model always get weight 1.0).
    retrieval_raw_vector_weight: float = 0.5

    # --- API -------------------------------------------------------------------
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    max_question_chars: int = 4000
    max_history_turns: int = 8
    # Per-client limit on question requests (each one may call the LLM twice).
    ask_rate_limit_per_minute: int = 20
    # Use the first X-Forwarded-For address as the client for rate limiting.
    # Enable only when the API is reachable solely through a trusted proxy
    # (such as the web app), otherwise clients could spoof the header.
    trust_forwarded_for: bool = False
    # Where the in-memory backend appends feedback reports (Postgres stores them
    # in the feedback table).
    feedback_file: Path = BACKEND_DIR / ".cache" / "feedback.jsonl"
    log_level: str = "INFO"

    # --- Ingestion ---------------------------------------------------------------
    # Wikimedia asks automated clients to identify themselves. Set this to
    # something that identifies your deployment (e.g. a project URL).
    ingest_user_agent: str = "bodh-ingest/0.1 (source-text ingestion; python-httpx)"

    @property
    def resolved_llm_api_key(self) -> str | None:
        if self.llm_api_key:
            return self.llm_api_key
        if self.llm_provider == "anthropic":
            return self.anthropic_api_key
        if self.llm_provider == "openai":
            return self.openai_api_key
        return None

    @property
    def resolved_fast_model(self) -> str:
        return self.llm_fast_model or self.llm_model


@lru_cache
def get_settings() -> Settings:
    return Settings()
