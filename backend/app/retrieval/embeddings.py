"""Embedding providers.

The default runs `intfloat/multilingual-e5-small` locally through ONNX
(fastembed), so semantic search needs no API key and handles English, Hindi
and other languages. Swap providers with EMBEDDING_PROVIDER / EMBEDDING_MODEL;
the store keeps vectors per model, so switching models just re-embeds.
"""

from __future__ import annotations

import logging
import threading
from functools import lru_cache
from typing import Any, Protocol

import numpy as np

from app.config import Settings, get_settings

log = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    pass


class Embedder(Protocol):
    model_id: str
    dim: int

    def embed_queries(self, texts: list[str]) -> np.ndarray: ...

    def embed_passages(self, texts: list[str]) -> np.ndarray: ...


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.clip(norms, 1e-12, None)


# (query prefix, passage prefix) for models trained with instructions.
_E5_PREFIXES = ("query: ", "passage: ")
_BGE_QUERY = "Represent this sentence for searching relevant passages: "
_PREFIXES: dict[str, tuple[str, str]] = {
    "BAAI/bge-small-en-v1.5": (_BGE_QUERY, ""),
    "BAAI/bge-base-en-v1.5": (_BGE_QUERY, ""),
    "snowflake/snowflake-arctic-embed-s": (_BGE_QUERY, ""),
    "snowflake/snowflake-arctic-embed-m": (_BGE_QUERY, ""),
    "nomic-ai/nomic-embed-text-v1.5": ("search_query: ", "search_document: "),
    "nomic-ai/nomic-embed-text-v1.5-Q": ("search_query: ", "search_document: "),
}


def prefixes_for(model: str) -> tuple[str, str]:
    if model in _PREFIXES:
        return _PREFIXES[model]
    return _E5_PREFIXES if "e5" in model.lower() else ("", "")


# ONNX files for models fastembed does not list itself.
_CUSTOM_ONNX: dict[str, dict[str, Any]] = {
    "intfloat/multilingual-e5-small": {
        "hf": "Xenova/multilingual-e5-small",
        "file": "onnx/model_quantized.onnx",
        "dim": 384,
    },
}


class LocalEmbedder:
    """In-process ONNX embeddings via fastembed."""

    def __init__(self, model: str, cache_dir: str) -> None:
        from fastembed import TextEmbedding

        spec = _CUSTOM_ONNX.get(model)
        if spec is not None and not any(m["model"] == model for m in TextEmbedding.list_supported_models()):
            from fastembed.common.model_description import ModelSource, PoolingType

            TextEmbedding.add_custom_model(
                model=model,
                pooling=PoolingType.MEAN,
                normalization=True,
                sources=ModelSource(hf=str(spec["hf"])),
                dim=int(spec["dim"]),
                model_file=str(spec["file"]),
            )
        self.model_id = model
        self._model = TextEmbedding(model, cache_dir=cache_dir)
        self._prefixes = prefixes_for(model)
        self._lock = threading.Lock()  # ONNX sessions are not re-entrant across threads here
        probe = self._embed(["probe"])
        self.dim = int(probe.shape[1])

    def _embed(self, texts: list[str]) -> np.ndarray:
        with self._lock:
            vectors = np.array(list(self._model.embed(texts, batch_size=32)), dtype=np.float32)
        return _normalize(vectors)

    def embed_queries(self, texts: list[str]) -> np.ndarray:
        return self._embed([self._prefixes[0] + t for t in texts])

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        return self._embed([self._prefixes[1] + t for t in texts])


class OpenAICompatibleEmbedder:
    """Any OpenAI-compatible /embeddings endpoint (OpenAI, Ollama, vLLM, ...)."""

    def __init__(self, model: str, base_url: str | None, api_key: str | None) -> None:
        from openai import OpenAI

        if not api_key and not base_url:
            raise EmbeddingError(
                "EMBEDDING_PROVIDER=openai needs EMBEDDING_API_KEY (or OPENAI_API_KEY), "
                "or EMBEDDING_BASE_URL for a local server."
            )
        self.model_id = model
        self._client = OpenAI(base_url=base_url, api_key=api_key or "not-needed")
        self._prefixes = prefixes_for(model)
        self.dim = int(self._call(["probe"]).shape[1])

    def _call(self, texts: list[str]) -> np.ndarray:
        try:
            response = self._client.embeddings.create(model=self.model_id, input=texts)
        except Exception as exc:
            raise EmbeddingError(f"Embedding request failed: {exc}") from exc
        vectors = np.array([item.embedding for item in response.data], dtype=np.float32)
        return _normalize(vectors)

    def embed_queries(self, texts: list[str]) -> np.ndarray:
        return self._call([self._prefixes[0] + t for t in texts])

    def embed_passages(self, texts: list[str]) -> np.ndarray:
        out = [self._call(texts[i : i + 64]) for i in range(0, len(texts), 64)]
        return np.vstack(out) if out else np.zeros((0, self.dim), dtype=np.float32)


def create_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "local":
        settings.embedding_cache_dir.mkdir(parents=True, exist_ok=True)
        return LocalEmbedder(settings.embedding_model, str(settings.embedding_cache_dir))
    if settings.embedding_provider == "ollama":
        base = settings.embedding_base_url or "http://localhost:11434/v1"
        return OpenAICompatibleEmbedder(settings.embedding_model, base, "ollama")
    return OpenAICompatibleEmbedder(
        settings.embedding_model,
        settings.embedding_base_url,
        settings.embedding_api_key or settings.openai_api_key,
    )


@lru_cache
def get_embedder() -> Embedder:
    settings = get_settings()
    log.info("Loading embedding model %s (%s)", settings.embedding_model, settings.embedding_provider)
    return create_embedder(settings)
