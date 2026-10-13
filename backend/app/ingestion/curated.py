"""Editorial data maintained by the project (not quoted from any source).

`data/curated/concepts.yaml` is a thematic index linking life situations to
passages. Everything in it is labelled as editorial wherever it is shown, and
the validator checks that every passage it names exists and that every
Sanskrit term it uses occurs in a linked verse.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field

from app.config import DATA_DIR
from app.corpus import Concept, Story

CURATED_DIR = DATA_DIR / "curated"


def _load_yaml(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a list")
    return data


def load_concepts(path: Path = CURATED_DIR / "concepts.yaml") -> list[Concept]:
    return [Concept.model_validate(item) for item in _load_yaml(path)]


def load_stories(path: Path = CURATED_DIR / "stories.yaml") -> list[Story]:
    return [Story.model_validate(item) for item in _load_yaml(path)]


class Sensitivity(BaseModel):
    """Editorial context for passages that are easily misused or misread."""

    id: str
    note: str
    exclude_in_crisis: bool = False
    passage_ids: list[str]


def load_sensitivities(path: Path = CURATED_DIR / "sensitivities.yaml") -> list[Sensitivity]:
    return [Sensitivity.model_validate(item) for item in _load_yaml(path)]


class Review(BaseModel):
    """An editor's decision on a verse flagged for review (see docs/DATA.md)."""

    passage_id: str
    decision: Literal["keep_printed", "correct"]
    # For "correct": the misprinted text exactly as it appears in the verse,
    # and its replacement.
    printed: str | None = None
    corrected: str | None = None
    basis: str = Field(min_length=10)
    reviewer: str = Field(min_length=2)
    date: dt.date


def load_reviews(path: Path = CURATED_DIR / "reviews.yaml") -> list[Review]:
    return [Review.model_validate(item) for item in _load_yaml(path)]
