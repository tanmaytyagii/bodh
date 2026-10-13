"""Load the processed corpus into PostgreSQL and compute missing embeddings."""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.corpus import Concept, load_corpus
from app.ingestion.pipeline import PROCESSED_DIR
from app.retrieval.embeddings import get_embedder
from app.storage.db import DatabaseUnavailable, migrate
from app.storage.indexing import PassageIndexRow, concept_texts, passage_rows

log = logging.getLogger(__name__)


def load_into_postgres(*, reembed: bool = False) -> str:
    settings = get_settings()
    corpus = load_corpus(PROCESSED_DIR)
    applied = migrate(settings.database_url)
    rows = passage_rows(corpus)

    try:
        conn = psycopg.connect(settings.database_url)
    except psycopg.OperationalError as exc:
        raise DatabaseUnavailable(str(exc)) from exc

    with conn:
        register_vector(conn)
        with conn.transaction():
            for source in corpus.sources:
                conn.execute(
                    """
                    INSERT INTO sources (id, sort_order, data) VALUES (%s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET sort_order = EXCLUDED.sort_order, data = EXCLUDED.data
                    """,
                    (source.id, source.sort_order, Jsonb(source.model_dump(mode="json"))),
                )
            for edition in corpus.editions:
                conn.execute(
                    """
                    INSERT INTO editions (id, data) VALUES (%s, %s)
                    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
                    """,
                    (edition.id, Jsonb(edition.model_dump(mode="json"))),
                )

            ids = [row.passage.id for row in rows]
            stale = conn.execute("DELETE FROM passages WHERE NOT (id = ANY(%s))", (ids,)).rowcount
            changed = 0
            with conn.cursor() as cur:
                for row in rows:
                    p = row.passage
                    cur.execute(
                        """
                        INSERT INTO passages (id, source_id, kind, division, position, speaker,
                            provenance_status, data, search_primary, search_secondary, roman_key,
                            content_hash, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                        ON CONFLICT (id) DO UPDATE SET
                            source_id = EXCLUDED.source_id, kind = EXCLUDED.kind,
                            division = EXCLUDED.division, position = EXCLUDED.position,
                            speaker = EXCLUDED.speaker, provenance_status = EXCLUDED.provenance_status,
                            data = EXCLUDED.data, search_primary = EXCLUDED.search_primary,
                            search_secondary = EXCLUDED.search_secondary,
                            roman_key = EXCLUDED.roman_key, content_hash = EXCLUDED.content_hash,
                            updated_at = now()
                        WHERE passages.content_hash <> EXCLUDED.content_hash
                        """,
                        (
                            p.id,
                            p.source_id,
                            p.kind,
                            _division(p.division),
                            p.position,
                            p.speaker,
                            p.provenance_status,
                            Jsonb(p.model_dump(mode="json")),
                            row.search_primary,
                            row.search_secondary,
                            row.roman_key,
                            row.content_hash,
                        ),
                    )
                    changed += cur.rowcount

            conn.execute("DELETE FROM concept_passages")
            conn.execute("DELETE FROM concepts WHERE NOT (id = ANY(%s))", ([c.id for c in corpus.concepts],))
            for concept in corpus.concepts:
                conn.execute(
                    "INSERT INTO concepts (id, data) VALUES (%s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
                    (concept.id, Jsonb(concept.model_dump(mode="json"))),
                )
                for rank, pid in enumerate(concept.passage_ids):
                    conn.execute(
                        "INSERT INTO concept_passages (concept_id, passage_id, rank) VALUES (%s, %s, %s)",
                        (concept.id, pid, rank),
                    )

            conn.execute("DELETE FROM stories WHERE NOT (id = ANY(%s))", ([s.id for s in corpus.stories],))
            for story in corpus.stories:
                conn.execute(
                    "INSERT INTO stories (id, source_id, data) VALUES (%s, %s, %s) "
                    "ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, data = EXCLUDED.data",
                    (story.id, story.source_id, Jsonb(story.model_dump(mode="json"))),
                )

        embedded = _embed_passages(conn, rows, reembed=reembed)
        embedded_concepts = _embed_concepts(conn, corpus.concepts, reembed=reembed)
        conn.execute("ANALYZE passages")
        conn.commit()

    model = get_settings().embedding_model
    return (
        f"Migrations applied: {applied or 'none'}. Passages: {len(rows)} "
        f"({changed} inserted/updated, {stale} removed). Concepts: {len(corpus.concepts)}. "
        f"Stories: {len(corpus.stories)}. Embedded with {model}: {embedded} passages, "
        f"{embedded_concepts} concepts."
    )


def _division(division: dict[str, int | str]) -> str | None:
    value = division.get("chapter", division.get("section"))
    return str(value) if value is not None else None


def _embed_passages(conn: psycopg.Connection[Any], rows: list[PassageIndexRow], *, reembed: bool) -> int:
    embedder = get_embedder()
    existing: dict[str, str] = dict(
        conn.execute(
            "SELECT passage_id, text_hash FROM passage_embeddings WHERE model = %s",
            (embedder.model_id,),
        ).fetchall()
    )
    todo = [row for row in rows if reembed or existing.get(row.passage.id) != row.text_hash]
    if not todo:
        return 0
    log.info("Embedding %d passages with %s", len(todo), embedder.model_id)
    for start in range(0, len(todo), 64):
        batch = todo[start : start + 64]
        vectors = embedder.embed_passages([row.embedding_text for row in batch])
        with conn.cursor() as cur:
            for row, vector in zip(batch, vectors, strict=True):
                cur.execute(
                    """
                    INSERT INTO passage_embeddings (passage_id, model, text_hash, embedding)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (passage_id, model) DO UPDATE
                    SET text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding
                    """,
                    (row.passage.id, embedder.model_id, row.text_hash, vector.astype(np.float32)),
                )
    return len(todo)


def _embed_concepts(conn: psycopg.Connection[Any], concepts: list[Concept], *, reembed: bool) -> int:
    embedder = get_embedder()
    existing: dict[str, str] = dict(
        conn.execute(
            "SELECT concept_id, text_hash FROM concept_embeddings WHERE model = %s",
            (embedder.model_id,),
        ).fetchall()
    )
    todo = [item for item in concept_texts(concepts) if reembed or existing.get(item[0].id) != item[2]]
    if not todo:
        return 0
    vectors = embedder.embed_passages([doc for _, doc, _ in todo])
    for (concept, _, digest), vector in zip(todo, vectors, strict=True):
        conn.execute(
            """
            INSERT INTO concept_embeddings (concept_id, model, text_hash, embedding)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (concept_id, model) DO UPDATE
            SET text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding
            """,
            (concept.id, embedder.model_id, digest, vector.astype(np.float32)),
        )
    return len(todo)
