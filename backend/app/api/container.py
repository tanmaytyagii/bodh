"""Application services, created once at startup."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.api.views import Lookup
from app.config import Settings
from app.generation.llm import LLMStatus, get_llm
from app.generation.service import GuidanceService
from app.retrieval.embeddings import Embedder, get_embedder
from app.retrieval.hybrid import HybridRetriever
from app.storage.repository import Repository

log = logging.getLogger(__name__)


@dataclass
class Container:
    settings: Settings
    repo: Repository
    embedder: Embedder
    retriever: HybridRetriever
    guidance: GuidanceService
    llm_status: LLMStatus
    lookup: Lookup
    _pool: Any = None

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close()


def build_container(settings: Settings) -> Container:
    embedder = get_embedder()
    pool = None
    repo: Repository
    if settings.retrieval_backend == "postgres":
        from app.storage.db import create_pool
        from app.storage.postgres import PostgresRepository

        pool = create_pool(settings.database_url)
        repo = PostgresRepository(pool, embedder.model_id)
        stats = repo.stats()
        if not stats["passages"]:
            raise RuntimeError("The database has no passages. Run `python -m app.ingestion load` first.")
        if stats["embedded"] < stats["passages"]:
            log.warning(
                "%d of %d passages have no %s embedding; run `python -m app.ingestion load`.",
                stats["passages"] - stats["embedded"],
                stats["passages"],
                embedder.model_id,
            )
    else:
        from app.config import BACKEND_DIR
        from app.corpus import load_corpus
        from app.ingestion.pipeline import PROCESSED_DIR
        from app.storage.memory import MemoryRepository

        repo = MemoryRepository(
            load_corpus(PROCESSED_DIR),
            embedder,
            cache_dir=BACKEND_DIR / ".cache" / "embeddings",
            feedback_path=settings.feedback_file,
        )

    llm, llm_status = get_llm()
    retriever = HybridRetriever(repo, embedder, settings)
    guidance = GuidanceService(
        repo=repo, retriever=retriever, llm=llm, llm_status=llm_status, settings=settings
    )
    lookup = Lookup(repo.list_sources(), repo.list_editions(), repo.list_concepts())
    return Container(
        settings=settings,
        repo=repo,
        embedder=embedder,
        retriever=retriever,
        guidance=guidance,
        llm_status=llm_status,
        lookup=lookup,
        _pool=pool,
    )
