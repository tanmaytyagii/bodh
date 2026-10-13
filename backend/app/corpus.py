"""Corpus record types shared by ingestion, storage, retrieval and the API.

The design rule: every piece of text shown to a user as scripture comes from a
record that names its edition and points back to where it can be checked.
Editorial material (summaries, concept labels, story analyses) is stored in
separate, clearly labelled fields and never mixed into source text.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

# verified:     agrees with an independent edition
# reviewed:     differs from it, and an editor confirmed the printed reading
# needs_review: differs from it, not yet reviewed
# unverified:   no independent text to check against yet
ProvenanceStatus = Literal["verified", "reviewed", "needs_review", "unverified"]


class TranslatorNote(BaseModel):
    """A footnote printed in the translation itself (not modern commentary)."""

    anchor: str | None = Field(None, description="Word(s) the note is attached to.")
    text: str


class EditionCorrection(BaseModel):
    """A place where the printed edition was corrected (or deliberately not)."""

    field: Literal["sanskrit", "translation", "verse_number", "speaker", "division_title"]
    printed: str
    corrected: str
    applied: bool
    basis: str


class CrossCheck(BaseModel):
    """Comparison of this record's original-language text with another edition."""

    edition_id: str
    status: Literal["exact", "orthographic", "variant", "missing"]
    other_text: str | None = None
    detail: str | None = None


class Citation(BaseModel):
    edition_id: str
    label: str
    url: str
    scan_url: str | None = None
    page: str | None = None


class Passage(BaseModel):
    """The unit of retrieval: a verse, or a short verbatim excerpt of a story."""

    id: str
    source_id: str
    kind: Literal["verse", "story"]
    ref: str
    path: str
    position: int
    division: dict[str, int | str]
    division_title: str | None = None
    speaker: str | None = None
    sanskrit: str | None = None
    transliteration: str | None = None
    translation: str
    translation_edition_id: str
    translator_notes: list[TranslatorNote] = Field(default_factory=list)
    corrections: list[EditionCorrection] = Field(default_factory=list)
    cross_checks: list[CrossCheck] = Field(default_factory=list)
    citation: Citation
    provenance_status: ProvenanceStatus = "unverified"
    provenance_notes: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Division(BaseModel):
    """A chapter (or other top-level division) of a source."""

    number: int | str
    title: str | None = None
    title_original: str | None = None
    passage_count: int = 0
    first_passage_id: str | None = None
    corrections: list[EditionCorrection] = Field(default_factory=list)


class Source(BaseModel):
    id: str
    title: str
    title_original: str | None = None
    tradition: str
    description: str
    division_label: str = "Chapter"
    passage_label: str = "Verse"
    sort_order: int = 0
    divisions: list[Division] = Field(default_factory=list)


class Edition(BaseModel):
    id: str
    # One printed edition can translate several sources (Paramananda's volume
    # covers three Upanishads).
    source_ids: list[str]
    role: Literal["primary", "cross_check"]
    language: str
    title: str
    contributors: str
    year: int | None = None
    publisher: str | None = None
    license: str
    url: str
    notes: str | None = None


class Concept(BaseModel):
    """An editorial index entry linking a theme to passages.

    Concepts are curated by the project, not quoted from a source; the API
    always labels them as editorial.
    """

    id: str
    name: str
    term: str | None = None
    term_original: str | None = None
    summary: str
    caveats: list[str] = Field(default_factory=list)
    life_situations: list[str] = Field(default_factory=list)
    passage_ids: list[str] = Field(default_factory=list)
    related: list[str] = Field(default_factory=list)


class StoryChoice(BaseModel):
    actor: str
    choice: str
    consequence: str | None = None


class Story(BaseModel):
    """A narrative episode with structured, editorial analysis.

    The analysis fields are written by the project's editors and must be
    checked against the verbatim excerpts (stored as passages) they cite.
    """

    id: str
    source_id: str
    title: str
    location: str
    characters: list[str]
    summary: str
    dilemma: str
    choices: list[StoryChoice]
    lessons: list[str]
    caveats: list[str] = Field(default_factory=list)
    life_situations: list[str] = Field(default_factory=list)
    excerpt_ids: list[str] = Field(default_factory=list)
    related_passage_ids: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Processed corpus on disk
# ---------------------------------------------------------------------------


class Corpus(BaseModel):
    sources: list[Source]
    editions: list[Edition]
    passages: list[Passage]
    concepts: list[Concept] = Field(default_factory=list)
    stories: list[Story] = Field(default_factory=list)

    def passage_map(self) -> dict[str, Passage]:
        return {p.id: p for p in self.passages}


def save_corpus(corpus: Corpus, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)

    def dump(name: str, items: list[Any]) -> None:
        data = [item.model_dump(mode="json") for item in items]
        (directory / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    dump("sources.json", corpus.sources)
    dump("editions.json", corpus.editions)
    dump("concepts.json", corpus.concepts)
    dump("stories.json", corpus.stories)
    with (directory / "passages.jsonl").open("w", encoding="utf-8") as fh:
        for passage in corpus.passages:
            fh.write(json.dumps(passage.model_dump(mode="json"), ensure_ascii=False) + "\n")


def load_corpus(directory: Path) -> Corpus:
    if not (directory / "passages.jsonl").exists():
        raise FileNotFoundError(f"No processed corpus in {directory}. Run `python -m app.ingestion build`.")

    def read(name: str) -> list[Any]:
        path = directory / name
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []

    passages = [
        Passage.model_validate_json(line)
        for line in (directory / "passages.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return Corpus(
        sources=[Source.model_validate(x) for x in read("sources.json")],
        editions=[Edition.model_validate(x) for x in read("editions.json")],
        passages=passages,
        concepts=[Concept.model_validate(x) for x in read("concepts.json")],
        stories=[Story.model_validate(x) for x in read("stories.json")],
    )
