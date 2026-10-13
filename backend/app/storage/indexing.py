"""Derived index data shared by the Postgres loader and the in-memory store."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from app.config import get_settings
from app.corpus import Concept, Corpus, Passage
from app.retrieval import text


@dataclass
class PassageIndexRow:
    passage: Passage
    search_primary: str
    search_secondary: str
    roman_key: str
    embedding_text: str
    content_hash: str
    text_hash: str


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def passage_rows(corpus: Corpus) -> list[PassageIndexRow]:
    concepts = {c.id: c for c in corpus.concepts}
    themes = get_settings().embedding_with_themes
    rows = []
    for passage in corpus.passages:
        primary, secondary = text.search_fields(passage, concepts)
        embed_text = text.embedding_text(passage, concepts, themes=themes)
        rows.append(
            PassageIndexRow(
                passage=passage,
                search_primary=primary,
                search_secondary=secondary,
                roman_key=text.roman_key(passage),
                embedding_text=embed_text,
                content_hash=sha256(json.dumps(passage.model_dump(mode="json"), sort_keys=True)),
                text_hash=sha256(embed_text),
            )
        )
    return rows


def concept_texts(concepts: list[Concept]) -> list[tuple[Concept, str, str]]:
    """(concept, document text, hash of that text)."""
    out = []
    for concept in concepts:
        doc = text.concept_document(concept)
        out.append((concept, doc, sha256(doc)))
    return out
