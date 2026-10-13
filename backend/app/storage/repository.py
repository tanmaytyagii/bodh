"""The repository interface both storage backends implement."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import numpy as np

from app.corpus import Concept, Edition, Passage, Source, Story

FeedbackKind = Literal[
    "incorrect_citation",
    "irrelevant_passage",
    "inaccurate_interpretation",
    "unhelpful_advice",
    "safety_concern",
    "helpful",
    "other",
]


@dataclass(frozen=True)
class Hit:
    id: str
    score: float


@dataclass
class FeedbackRecord:
    kind: FeedbackKind
    passage_id: str | None = None
    answer_id: str | None = None
    comment: str | None = None
    context: dict[str, Any] | None = field(default=None)


class Repository(Protocol):
    backend: str

    # --- corpus -----------------------------------------------------------
    def list_sources(self) -> list[Source]: ...
    def get_source(self, source_id: str) -> Source | None: ...
    def list_editions(self) -> list[Edition]: ...
    def get_passage(self, passage_id: str) -> Passage | None: ...
    def get_passages(self, passage_ids: list[str]) -> list[Passage]: ...
    def get_passage_by_path(self, source_id: str, path: str) -> Passage | None: ...
    def division_passages(self, source_id: str, division: str) -> list[Passage]: ...
    def neighbors(self, passage_id: str, before: int, after: int) -> tuple[list[Passage], list[Passage]]: ...
    def list_concepts(self) -> list[Concept]: ...
    def get_concept(self, concept_id: str) -> Concept | None: ...
    def list_stories(self) -> list[Story]: ...
    def get_story(self, story_id: str) -> Story | None: ...

    # --- search -----------------------------------------------------------
    def lexical_search(
        self, words: list[str], limit: int, source_ids: list[str] | None = None
    ) -> list[Hit]: ...
    def vector_search(
        self, vector: np.ndarray, limit: int, source_ids: list[str] | None = None
    ) -> list[Hit]: ...
    def roman_search(self, key: str, limit: int, threshold: float = 0.5) -> list[Hit]: ...
    def concept_search(self, vector: np.ndarray, limit: int) -> list[Hit]: ...
    def similar_passages(self, passage_id: str, limit: int) -> list[Hit]: ...

    # --- feedback & health --------------------------------------------------
    def add_feedback(self, record: FeedbackRecord) -> int: ...
    def stats(self) -> dict[str, Any]: ...
