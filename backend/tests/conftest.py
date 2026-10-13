"""Shared fixtures.

Tests run against the processed corpus in data/processed with the in-memory
repository, so they need neither Docker nor an API key. The language model is
replaced by `FakeLLM`, which builds schema-valid replies from the prompt it is
given - including a deliberately bad citation, to exercise verification.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

import pytest

from app.config import BACKEND_DIR, get_settings
from app.corpus import Corpus, load_corpus
from app.generation.llm import LLMError, LLMStatus, StepConfig
from app.generation.schemas import (
    GuidanceDraft,
    RelatedDraft,
    SafetyAssessment,
    StepDraft,
    TeachingDraft,
    Understanding,
)
from app.ingestion.pipeline import PROCESSED_DIR
from app.retrieval.embeddings import get_embedder
from app.retrieval.hybrid import HybridRetriever
from app.storage.memory import MemoryRepository


@pytest.fixture(scope="session")
def corpus() -> Corpus:
    return load_corpus(PROCESSED_DIR)


@pytest.fixture(scope="session")
def repo(corpus: Corpus) -> MemoryRepository:
    return MemoryRepository(corpus, get_embedder(), cache_dir=BACKEND_DIR / ".cache" / "embeddings")


@pytest.fixture(scope="session")
def retriever(repo: MemoryRepository) -> HybridRetriever:
    return HybridRetriever(repo, repo.embedder, get_settings())


class FakeLLM:
    """Deterministic stand-in for a language model (tests only)."""

    provider = "fake"

    def __init__(
        self,
        *,
        understanding: dict[str, Any] | None = None,
        fail: LLMError | None = None,
        fail_on: str | None = None,
    ) -> None:
        self.overrides = understanding or {}
        self.fail = fail
        self.fail_on = fail_on
        self.calls: list[tuple[str, str]] = []

    def structured(self, *, system: str, user: str, schema: type, step: StepConfig) -> Any:
        self.calls.append((schema.__name__, user))
        if self.fail and (self.fail_on is None or self.fail_on == schema.__name__):
            raise self.fail
        if schema is Understanding:
            data: dict[str, Any] = {
                "language": "en",
                "request_type": "life_situation",
                "situation_summary": "You are under pressure and feel you are falling behind.",
                "core_dilemma": "How to keep going without being crushed by outcomes.",
                "emotions": ["anxiety", "envy"],
                "clarifying_question": None,
                "search_queries": ["fruit of action", "balanced in success and failure"],
                "concept_ids": ["action-without-attachment", "comparison-and-envy"],
                "safety": SafetyAssessment(level="none", categories=[], note="No risk indicated."),
            }
            data.update(self.overrides)
            return Understanding(**data)
        ids = re.findall(r'<passage id="([^"]+)"', user)
        first, second = ids[0], ids[1] if len(ids) > 1 else ids[0]
        return GuidanceDraft(
            response_kind="guidance",
            situation=f"Your situation, reflected back. See [[{first}]] and [[bg.99.99]].",
            teachings=[
                TeachingDraft(
                    passage_id=first,
                    what_it_says="It says to act without fixating on results.",
                    context="Krishna is answering Arjuna.",
                    interpretation_notes=None,
                    why_it_applies="You are focused on results.",
                    application='You might think "you will certainly get the job tomorrow".',
                    limits="It does not say results never matter.",
                ),
                TeachingDraft(
                    passage_id="bg.99.99",
                    what_it_says="An invented verse.",
                    context="None.",
                    interpretation_notes=None,
                    why_it_applies="None.",
                    application="None.",
                    limits="None.",
                ),
            ],
            path_forward_intro="A few steps.",
            steps=[StepDraft(title="Write down what you control", detail="Two lists.", timeframe="today")],
            framework=None,
            reflective_question="What would you do if the result were already decided?",
            follow_up_message=None,
            related=[RelatedDraft(passage_id=second, reason="Same theme.")],
            evidence="moderate",
            evidence_note=None,
            alternative_readings=None,
            suggested_follow_ups=["What does this verse mean by inaction?"],
        )


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def make_app(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> Iterator[Any]:
    """Factory for a TestClient whose app uses the memory backend and a given LLM."""
    from fastapi.testclient import TestClient

    from app.api import container as container_module

    clients: list[TestClient] = []

    def factory(llm: Any = None, rate_limit: int = 100) -> TestClient:
        monkeypatch.setenv("RETRIEVAL_BACKEND", "memory")
        monkeypatch.setenv("ASK_RATE_LIMIT_PER_MINUTE", str(rate_limit))
        monkeypatch.setenv("FEEDBACK_FILE", str(tmp_path / "feedback.jsonl"))
        get_settings.cache_clear()
        status = (
            LLMStatus("fake", True, "fake-model")
            if llm is not None
            else LLMStatus("none", False, None, "Generation disabled for this test.")
        )
        monkeypatch.setattr(container_module, "get_llm", lambda: (llm, status))
        from app.main import create_app

        client = TestClient(create_app())
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)
    get_settings.cache_clear()
