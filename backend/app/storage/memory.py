"""In-memory repository built from the processed corpus.

Mirrors the Postgres backend's behaviour for tests and for running the app
without Docker: the same BM25 index over the same search text (storage/lexical.py),
cosine similarity over the same embeddings, trigram containment for fuzzy
romanized Sanskrit.
"""

from __future__ import annotations

import json
import threading
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from app.corpus import Concept, Corpus, Edition, Passage, Source, Story
from app.retrieval.embeddings import Embedder
from app.storage.indexing import concept_texts, passage_rows, sha256
from app.storage.lexical import LexicalIndex
from app.storage.repository import FeedbackRecord, Hit


def _trigrams(value: str) -> set[str]:
    padded = f"  {value} "
    return {padded[i : i + 3] for i in range(len(padded) - 2)}


class MemoryRepository:
    backend = "memory"

    def __init__(
        self,
        corpus: Corpus,
        embedder: Embedder | None,
        *,
        cache_dir: Path | None = None,
        feedback_path: Path | None = None,
    ) -> None:
        self.corpus = corpus
        self.embedder = embedder
        self.feedback_path = feedback_path
        self._feedback: list[dict[str, Any]] = []
        self._lock = threading.Lock()

        rows = passage_rows(corpus)
        self.passages = [row.passage for row in rows]
        self.by_id = {p.id: p for p in self.passages}
        self.index_of = {p.id: i for i, p in enumerate(self.passages)}
        self.by_path = {(p.source_id, p.path): p for p in self.passages}
        self.by_division: dict[tuple[str, str], list[Passage]] = defaultdict(list)
        for p in self.passages:
            division = p.division.get("chapter", p.division.get("section"))
            self.by_division[(p.source_id, str(division))].append(p)
        self.sources = {s.id: s for s in corpus.sources}
        self.concepts = {c.id: c for c in corpus.concepts}
        self.stories = {s.id: s for s in corpus.stories}

        self._lexical = LexicalIndex(
            [p.id for p in self.passages],
            [p.source_id for p in self.passages],
            [r.search_primary for r in rows],
            [r.search_secondary for r in rows],
        )
        self._roman = [_trigrams(r.roman_key) if r.roman_key else set() for r in rows]
        self._source_of = np.array([p.source_id for p in self.passages])

        self.vectors: np.ndarray | None = None
        self.concept_ids: list[str] = []
        self.concept_vectors: np.ndarray | None = None
        if embedder is not None:
            self.vectors = self._cached_embeddings(
                embedder, [r.embedding_text for r in rows], cache_dir, "passages"
            )
            items = concept_texts(corpus.concepts)
            self.concept_ids = [c.id for c, _, _ in items]
            self.concept_vectors = self._cached_embeddings(
                embedder, [doc for _, doc, _ in items], cache_dir, "concepts"
            )

    @staticmethod
    def _cached_embeddings(
        embedder: Embedder, texts: list[str], cache_dir: Path | None, label: str
    ) -> np.ndarray:
        if not texts:
            return np.zeros((0, embedder.dim), dtype=np.float32)
        digest = sha256(embedder.model_id + "\n" + "\n".join(texts))[:20]
        path = None
        if cache_dir is not None:
            slug = embedder.model_id.replace("/", "--")
            path = cache_dir / f"{slug}-{label}-{digest}.npy"
            if path.exists():
                return np.load(path)
        vectors = embedder.embed_passages(texts).astype(np.float32)
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            np.save(path, vectors)
        return vectors

    # --- corpus -----------------------------------------------------------

    def list_sources(self) -> list[Source]:
        return sorted(self.sources.values(), key=lambda s: (s.sort_order, s.id))

    def get_source(self, source_id: str) -> Source | None:
        return self.sources.get(source_id)

    def list_editions(self) -> list[Edition]:
        return sorted(self.corpus.editions, key=lambda e: e.id)

    def get_passage(self, passage_id: str) -> Passage | None:
        return self.by_id.get(passage_id)

    def get_passages(self, passage_ids: list[str]) -> list[Passage]:
        return [self.by_id[pid] for pid in passage_ids if pid in self.by_id]

    def get_passage_by_path(self, source_id: str, path: str) -> Passage | None:
        return self.by_path.get((source_id, path))

    def division_passages(self, source_id: str, division: str) -> list[Passage]:
        return list(self.by_division.get((source_id, str(division)), []))

    def neighbors(self, passage_id: str, before: int, after: int) -> tuple[list[Passage], list[Passage]]:
        i = self.index_of.get(passage_id)
        if i is None:
            return [], []
        source = self.passages[i].source_id
        prev = [p for p in self.passages[max(0, i - before) : i] if p.source_id == source]
        nxt = [p for p in self.passages[i + 1 : i + 1 + after] if p.source_id == source]
        return prev, nxt

    def list_concepts(self) -> list[Concept]:
        return sorted(self.concepts.values(), key=lambda c: c.name)

    def get_concept(self, concept_id: str) -> Concept | None:
        return self.concepts.get(concept_id)

    def list_stories(self) -> list[Story]:
        return sorted(self.stories.values(), key=lambda s: s.id)

    def get_story(self, story_id: str) -> Story | None:
        return self.stories.get(story_id)

    # --- search -----------------------------------------------------------

    def _mask(self, source_ids: list[str] | None) -> np.ndarray:
        if not source_ids:
            return np.ones(len(self.passages), dtype=bool)
        return np.isin(self._source_of, source_ids)

    def _top(self, scores: np.ndarray, limit: int, mask: np.ndarray) -> list[Hit]:
        scores = np.where(mask, scores, -np.inf)
        order = np.argsort(-scores, kind="stable")[:limit]
        return [Hit(self.passages[i].id, float(scores[i])) for i in order if np.isfinite(scores[i])]

    def lexical_search(self, words: list[str], limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        return self._lexical.search(words, limit, source_ids)

    def vector_search(self, vector: np.ndarray, limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        if self.vectors is None or not len(self.vectors):
            return []
        return self._top(self.vectors @ vector.astype(np.float32), limit, self._mask(source_ids))

    def roman_search(self, key: str, limit: int, threshold: float = 0.5) -> list[Hit]:
        if len(key) < 6:
            return []
        query = _trigrams(key)
        scores = np.array([len(query & grams) / len(query) if grams else 0.0 for grams in self._roman])
        scores = np.where(scores >= threshold, scores, -np.inf)
        return self._top(scores, limit, self._mask(None))

    def concept_search(self, vector: np.ndarray, limit: int) -> list[Hit]:
        if self.concept_vectors is None or not len(self.concept_vectors):
            return []
        scores = self.concept_vectors @ vector.astype(np.float32)
        order = np.argsort(-scores)[:limit]
        return [Hit(self.concept_ids[i], float(scores[i])) for i in order]

    def similar_passages(self, passage_id: str, limit: int) -> list[Hit]:
        i = self.index_of.get(passage_id)
        if i is None or self.vectors is None:
            return []
        scores = self.vectors @ self.vectors[i]
        scores[i] = -np.inf
        return self._top(scores, limit, self._mask(None))

    # --- feedback & health ----------------------------------------------------

    def add_feedback(self, record: FeedbackRecord) -> int:
        entry = {
            "created_at": datetime.now(UTC).isoformat(),
            "kind": record.kind,
            "passage_id": record.passage_id,
            "answer_id": record.answer_id,
            "comment": record.comment,
            "context": record.context,
        }
        with self._lock:
            self._feedback.append(entry)
            entry_id = len(self._feedback)
            if self.feedback_path is not None:
                self.feedback_path.parent.mkdir(parents=True, exist_ok=True)
                with self.feedback_path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"id": entry_id, **entry}, ensure_ascii=False) + "\n")
        return entry_id

    def stats(self) -> dict[str, Any]:
        return {
            "backend": self.backend,
            "passages": len(self.passages),
            "embedded": 0 if self.vectors is None else len(self.vectors),
            "concepts": len(self.concepts),
            "stories": len(self.stories),
        }
