"""PostgreSQL repository: pgvector for semantic search, full-text search for
lexical search, pg_trgm for fuzzy matching of romanized Sanskrit."""

from __future__ import annotations

import re
from typing import Any

import numpy as np
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.corpus import Concept, Edition, Passage, Source, Story
from app.storage.repository import FeedbackRecord, Hit

_SAFE_WORD = re.compile(r"^[a-z]+$")


class PostgresRepository:
    backend = "postgres"

    def __init__(self, pool: ConnectionPool, embedding_model: str) -> None:
        self.pool = pool
        self.model = embedding_model

    # --- corpus -----------------------------------------------------------

    def _rows(self, sql: str, params: Any = None) -> list[tuple[Any, ...]]:
        with self.pool.connection() as conn:
            return list(conn.execute(sql, params).fetchall())

    def list_sources(self) -> list[Source]:
        rows = self._rows("SELECT data FROM sources ORDER BY sort_order, id")
        return [Source.model_validate(r[0]) for r in rows]

    def get_source(self, source_id: str) -> Source | None:
        rows = self._rows("SELECT data FROM sources WHERE id = %s", (source_id,))
        return Source.model_validate(rows[0][0]) if rows else None

    def list_editions(self) -> list[Edition]:
        return [Edition.model_validate(r[0]) for r in self._rows("SELECT data FROM editions ORDER BY id")]

    def get_passage(self, passage_id: str) -> Passage | None:
        rows = self._rows("SELECT data FROM passages WHERE id = %s", (passage_id,))
        return Passage.model_validate(rows[0][0]) if rows else None

    def get_passages(self, passage_ids: list[str]) -> list[Passage]:
        if not passage_ids:
            return []
        rows = self._rows("SELECT id, data FROM passages WHERE id = ANY(%s)", (passage_ids,))
        found = {r[0]: Passage.model_validate(r[1]) for r in rows}
        return [found[pid] for pid in passage_ids if pid in found]

    def get_passage_by_path(self, source_id: str, path: str) -> Passage | None:
        rows = self._rows(
            "SELECT data FROM passages WHERE source_id = %s AND data->>'path' = %s", (source_id, path)
        )
        return Passage.model_validate(rows[0][0]) if rows else None

    def division_passages(self, source_id: str, division: str) -> list[Passage]:
        rows = self._rows(
            "SELECT data FROM passages WHERE source_id = %s AND division = %s ORDER BY position",
            (source_id, division),
        )
        return [Passage.model_validate(r[0]) for r in rows]

    def neighbors(self, passage_id: str, before: int, after: int) -> tuple[list[Passage], list[Passage]]:
        rows = self._rows(
            """
            WITH target AS (SELECT source_id, position FROM passages WHERE id = %(id)s)
            SELECT p.position - t.position AS offset, p.data
            FROM passages p, target t
            WHERE p.source_id = t.source_id
              AND p.position BETWEEN t.position - %(before)s AND t.position + %(after)s
              AND p.id <> %(id)s
            ORDER BY p.position
            """,
            {"id": passage_id, "before": before, "after": after},
        )
        prev = [Passage.model_validate(r[1]) for r in rows if r[0] < 0]
        nxt = [Passage.model_validate(r[1]) for r in rows if r[0] > 0]
        return prev, nxt

    def list_concepts(self) -> list[Concept]:
        rows = self._rows("SELECT data FROM concepts ORDER BY data->>'name'")
        return [Concept.model_validate(r[0]) for r in rows]

    def get_concept(self, concept_id: str) -> Concept | None:
        rows = self._rows("SELECT data FROM concepts WHERE id = %s", (concept_id,))
        return Concept.model_validate(rows[0][0]) if rows else None

    def list_stories(self) -> list[Story]:
        return [Story.model_validate(r[0]) for r in self._rows("SELECT data FROM stories ORDER BY id")]

    def get_story(self, story_id: str) -> Story | None:
        rows = self._rows("SELECT data FROM stories WHERE id = %s", (story_id,))
        return Story.model_validate(rows[0][0]) if rows else None

    # --- search -----------------------------------------------------------

    def lexical_search(self, words: list[str], limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        terms = [w for w in words if _SAFE_WORD.match(w)]
        if not terms:
            return []
        rows = self._rows(
            """
            SELECT id, ts_rank_cd(search_tsv, q, 32) AS score
            FROM passages, to_tsquery('english', %(q)s) q
            WHERE search_tsv @@ q
              AND (%(sources)s::text[] IS NULL OR source_id = ANY(%(sources)s))
            ORDER BY score DESC, position
            LIMIT %(limit)s
            """,
            {"q": " | ".join(terms), "sources": source_ids, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    def vector_search(self, vector: np.ndarray, limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        rows = self._rows(
            """
            SELECT p.id, 1 - (e.embedding <=> %(v)s) AS score
            FROM passage_embeddings e JOIN passages p ON p.id = e.passage_id
            WHERE e.model = %(model)s
              AND (%(sources)s::text[] IS NULL OR p.source_id = ANY(%(sources)s))
            ORDER BY e.embedding <=> %(v)s
            LIMIT %(limit)s
            """,
            {"v": vector.astype(np.float32), "model": self.model, "sources": source_ids, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    def roman_search(self, key: str, limit: int, threshold: float = 0.5) -> list[Hit]:
        if len(key) < 6:
            return []
        rows = self._rows(
            """
            SELECT id, word_similarity(%(k)s, roman_key) AS score
            FROM passages
            WHERE roman_key <> '' AND word_similarity(%(k)s, roman_key) >= %(t)s
            ORDER BY score DESC, position
            LIMIT %(limit)s
            """,
            {"k": key, "t": threshold, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    def concept_search(self, vector: np.ndarray, limit: int) -> list[Hit]:
        rows = self._rows(
            """
            SELECT concept_id, 1 - (embedding <=> %(v)s) AS score
            FROM concept_embeddings WHERE model = %(model)s
            ORDER BY embedding <=> %(v)s LIMIT %(limit)s
            """,
            {"v": vector.astype(np.float32), "model": self.model, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    def similar_passages(self, passage_id: str, limit: int) -> list[Hit]:
        rows = self._rows(
            """
            SELECT e.passage_id, 1 - (e.embedding <=> t.embedding) AS score
            FROM passage_embeddings e
            JOIN passage_embeddings t ON t.passage_id = %(id)s AND t.model = e.model
            WHERE e.model = %(model)s AND e.passage_id <> %(id)s
            ORDER BY e.embedding <=> t.embedding
            LIMIT %(limit)s
            """,
            {"id": passage_id, "model": self.model, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    # --- feedback & health ----------------------------------------------------

    def add_feedback(self, record: FeedbackRecord) -> int:
        with self.pool.connection() as conn:
            row = conn.execute(
                """
                INSERT INTO feedback (kind, passage_id, answer_id, comment, context)
                VALUES (%s, %s, %s, %s, %s) RETURNING id
                """,
                (
                    record.kind,
                    record.passage_id,
                    record.answer_id,
                    record.comment,
                    Jsonb(record.context) if record.context is not None else None,
                ),
            ).fetchone()
        assert row is not None
        return int(row[0])

    def stats(self) -> dict[str, Any]:
        rows = self._rows(
            """
            SELECT
              (SELECT count(*) FROM passages),
              (SELECT count(*) FROM passage_embeddings WHERE model = %(m)s),
              (SELECT count(*) FROM concepts),
              (SELECT count(*) FROM stories)
            """,
            {"m": self.model},
        )
        passages, embedded, concepts, stories = rows[0]
        return {
            "backend": self.backend,
            "passages": passages,
            "embedded": embedded,
            "concepts": concepts,
            "stories": stories,
        }
