"""Response models for the HTTP API and builders from corpus records."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.corpus import Concept, Edition, Passage, ProvenanceStatus, Source, Story

# --------------------------------------------------------------------------
# Passages
# --------------------------------------------------------------------------


class CitationView(BaseModel):
    label: str
    url: str
    scan_url: str | None = None
    page: str | None = None


class CrossCheckView(BaseModel):
    edition: str
    status: str
    other_text: str | None = None
    detail: str | None = None


class ProvenanceView(BaseModel):
    status: ProvenanceStatus
    label: str
    notes: list[str] = Field(default_factory=list)
    cross_checks: list[CrossCheckView] = Field(default_factory=list)


class NoteView(BaseModel):
    anchor: str | None
    text: str


class CorrectionView(BaseModel):
    field: str
    printed: str
    corrected: str
    applied: bool
    basis: str


class ConceptRef(BaseModel):
    id: str
    name: str


class PassageView(BaseModel):
    id: str
    ref: str
    short_ref: str
    path: str
    source_id: str
    source_title: str
    chapter: int | str | None
    verse: int | str | None
    chapter_title: str | None
    chapter_title_original: str | None
    speaker: str | None
    speakers: list[str]
    sanskrit: str | None
    transliteration: str | None
    transliteration_note: str | None
    translation: str
    translator: str
    citation: CitationView
    provenance: ProvenanceView
    translator_notes: list[NoteView]
    corrections: list[CorrectionView]
    context_notes: list[str]
    concepts: list[ConceptRef]


_PROVENANCE_LABELS = {
    "verified": "Sanskrit cross-checked against an independent edition",
    "reviewed": "Sanskrit differs from an independent edition - printed reading confirmed by an editor",
    "needs_review": "Sanskrit differs from an independent edition - under review",
    "unverified": "Not yet independently checked",
}


class Lookup:
    """Sources, editions and concepts needed to render passages."""

    def __init__(self, sources: list[Source], editions: list[Edition], concepts: list[Concept]) -> None:
        self.sources = {s.id: s for s in sources}
        self.editions = {e.id: e for e in editions}
        self.concepts = {c.id: c for c in concepts}


def translator_label(edition: Edition | None) -> str:
    if edition is None:
        return "Unknown translator"
    name = edition.contributors.split("(")[0].strip().rstrip(";")
    return f"{name} ({edition.year})" if edition.year else name


def short_ref(passage: Passage) -> str:
    if passage.source_id == "bhagavad-gita":
        return f"BG {passage.division.get('chapter')}.{passage.division.get('verse')}"
    standard = passage.metadata.get("standard_ref")
    if standard:
        return f"{passage.ref.split()[0]} {standard}"
    return passage.ref


def passage_view(passage: Passage, lookup: Lookup) -> PassageView:
    source = lookup.sources.get(passage.source_id)
    edition = lookup.editions.get(passage.translation_edition_id)
    concepts = [
        ConceptRef(id=cid, name=lookup.concepts[cid].name)
        for cid in passage.metadata.get("concepts", [])
        if cid in lookup.concepts
    ]
    return PassageView(
        id=passage.id,
        ref=passage.ref,
        short_ref=short_ref(passage),
        path=f"/scripture/{passage.source_id}/{passage.path}",
        source_id=passage.source_id,
        source_title=source.title if source else passage.source_id,
        chapter=passage.division.get("chapter"),
        verse=passage.division.get("verse"),
        chapter_title=passage.division_title,
        chapter_title_original=passage.metadata.get("chapter_title_original"),
        speaker=passage.speaker,
        speakers=passage.metadata.get("speakers") or ([passage.speaker] if passage.speaker else []),
        sanskrit=passage.sanskrit,
        transliteration=passage.transliteration,
        transliteration_note=("IAST, generated from the Devanagari" if passage.transliteration else None),
        translation=passage.translation,
        translator=translator_label(edition),
        citation=CitationView(**passage.citation.model_dump(exclude={"edition_id"})),
        provenance=ProvenanceView(
            status=passage.provenance_status,
            label=_PROVENANCE_LABELS[passage.provenance_status],
            notes=passage.provenance_notes,
            cross_checks=[
                CrossCheckView(
                    edition=lookup.editions[c.edition_id].title
                    if c.edition_id in lookup.editions
                    else c.edition_id,
                    status=c.status,
                    other_text=c.other_text,
                    detail=c.detail,
                )
                for c in passage.cross_checks
            ],
        ),
        translator_notes=[NoteView(anchor=n.anchor, text=n.text) for n in passage.translator_notes],
        corrections=[CorrectionView(**c.model_dump()) for c in passage.corrections],
        context_notes=[note["note"] for note in passage.metadata.get("sensitivity", [])],
        concepts=concepts,
    )


# --------------------------------------------------------------------------
# Sources, concepts, stories
# --------------------------------------------------------------------------


class DivisionView(BaseModel):
    number: int | str
    title: str | None
    title_original: str | None
    passage_count: int


class EditionView(BaseModel):
    id: str
    role: str
    title: str
    contributors: str
    year: int | None
    publisher: str | None
    license: str
    url: str
    notes: str | None


class SourceView(BaseModel):
    id: str
    title: str
    title_original: str | None
    tradition: str
    description: str
    division_label: str
    passage_label: str
    passage_count: int
    divisions: list[DivisionView]
    editions: list[EditionView]


def source_view(source: Source, editions: list[Edition]) -> SourceView:
    return SourceView(
        id=source.id,
        title=source.title,
        title_original=source.title_original,
        tradition=source.tradition,
        description=source.description,
        division_label=source.division_label,
        passage_label=source.passage_label,
        passage_count=sum(d.passage_count for d in source.divisions),
        divisions=[
            DivisionView(
                number=d.number,
                title=d.title,
                title_original=d.title_original,
                passage_count=d.passage_count,
            )
            for d in source.divisions
        ],
        editions=[
            EditionView(**e.model_dump(exclude={"source_ids", "language"}))
            for e in editions
            if source.id in e.source_ids
        ],
    )


class ConceptView(BaseModel):
    id: str
    name: str
    term: str | None
    summary: str
    caveats: list[str]
    life_situations: list[str]
    related: list[ConceptRef]
    passages: list[PassageView] = Field(default_factory=list)
    editorial: bool = True


def concept_view(concept: Concept, lookup: Lookup, passages: list[Passage] | None = None) -> ConceptView:
    return ConceptView(
        id=concept.id,
        name=concept.name,
        term=concept.term,
        summary=concept.summary,
        caveats=concept.caveats,
        life_situations=concept.life_situations,
        related=[
            ConceptRef(id=r, name=lookup.concepts[r].name) for r in concept.related if r in lookup.concepts
        ],
        passages=[passage_view(p, lookup) for p in passages or []],
    )


class StoryView(BaseModel):
    id: str
    title: str
    source_id: str
    location: str
    characters: list[str]
    summary: str
    dilemma: str
    choices: list[dict[str, Any]]
    lessons: list[str]
    caveats: list[str]
    excerpts: list[PassageView] = Field(default_factory=list)
    related: list[PassageView] = Field(default_factory=list)
    editorial: bool = True


def story_view(story: Story, lookup: Lookup, excerpts: list[Passage], related: list[Passage]) -> StoryView:
    return StoryView(
        id=story.id,
        title=story.title,
        source_id=story.source_id,
        location=story.location,
        characters=story.characters,
        summary=story.summary,
        dilemma=story.dilemma,
        choices=[c.model_dump() for c in story.choices],
        lessons=story.lessons,
        caveats=story.caveats,
        excerpts=[passage_view(p, lookup) for p in excerpts],
        related=[passage_view(p, lookup) for p in related],
    )
