"""Validation of the processed corpus.

Errors block a build (a corpus with them must not be served). Warnings are
records that are usable but carry a flag, e.g. Sanskrit that differs from the
cross-check edition; they are listed so an editor can review them.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.corpus import Corpus, short_ref
from app.ingestion.normalize import loose_roman, to_iast

_DEVANAGARI = re.compile("[\u0900-\u097f]")
_LATIN = re.compile("[A-Za-z]")


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors


def validate(corpus: Corpus) -> ValidationReport:
    report = ValidationReport()
    errors, warnings = report.errors, report.warnings

    source_ids = {s.id for s in corpus.sources}
    editions = {e.id: e for e in corpus.editions}
    edition_ids = set(editions)
    for edition in corpus.editions:
        for sid in edition.source_ids:
            if sid not in source_ids:
                errors.append(f"edition {edition.id}: unknown source {sid!r}")
    passages = corpus.passage_map()

    if len(passages) != len(corpus.passages):
        dupes = [k for k, v in Counter(p.id for p in corpus.passages).items() if v > 1]
        errors.append(f"Duplicate passage ids: {dupes[:20]}")

    last_position: dict[str, int] = defaultdict(int)
    unchecked: Counter[str] = Counter()
    for p in corpus.passages:
        where = f"{p.id}:"
        if p.source_id not in source_ids:
            errors.append(f"{where} unknown source {p.source_id!r}")
        if p.translation_edition_id not in edition_ids:
            errors.append(f"{where} unknown edition {p.translation_edition_id!r}")
        elif p.source_id not in editions[p.translation_edition_id].source_ids:
            errors.append(
                f"{where} edition {p.translation_edition_id!r} does not list source {p.source_id!r}"
            )
        if p.citation.edition_id not in edition_ids:
            errors.append(f"{where} citation names unknown edition {p.citation.edition_id!r}")
        if not p.translation.strip():
            errors.append(f"{where} empty translation")
        if not p.citation.url.startswith("https://"):
            errors.append(f"{where} citation has no https URL")
        if p.sanskrit and not p.transliteration:
            errors.append(f"{where} Sanskrit without transliteration")
        elif p.sanskrit and p.transliteration != to_iast(p.sanskrit):
            errors.append(f"{where} transliteration does not match the Sanskrit shown")
        if _DEVANAGARI.search(p.translation):
            errors.append(f"{where} Devanagari text inside the English translation")
        if p.sanskrit and _LATIN.search(p.sanskrit):
            errors.append(f"{where} Latin letters inside the Sanskrit text")
        if p.position <= last_position[p.source_id]:
            errors.append(f"{where} position {p.position} out of order")
        last_position[p.source_id] = p.position
        for check in p.cross_checks:
            if check.edition_id not in edition_ids:
                errors.append(f"{where} cross-check names unknown edition {check.edition_id!r}")
        if p.provenance_status == "needs_review":
            reason = "; ".join(p.provenance_notes) or "no independent check available"
            detail = next((c.detail for c in p.cross_checks if c.detail), None)
            warnings.append(f"{p.id} [{p.provenance_status}] {reason}" + (f" ({detail})" if detail else ""))
        elif p.provenance_status == "unverified":
            unchecked[p.translation_edition_id] += 1

    for edition_id, count in sorted(unchecked.items()):
        warnings.append(
            f"{count} passages from {edition_id} have no independent check yet (translation only)"
        )

    for source in corpus.sources:
        counted = sum(1 for p in corpus.passages if p.source_id == source.id)
        declared = sum(d.passage_count for d in source.divisions)
        if source.divisions and counted != declared:
            errors.append(f"source {source.id}: divisions declare {declared} passages, found {counted}")

    concept_ids = {c.id for c in corpus.concepts}
    for concept in corpus.concepts:
        missing = [pid for pid in concept.passage_ids if pid not in passages]
        if missing:
            errors.append(f"concept {concept.id}: unknown passages {missing}")
        if not concept.passage_ids:
            errors.append(f"concept {concept.id}: no passages")
        for rel in concept.related:
            if rel not in concept_ids:
                errors.append(f"concept {concept.id}: unknown related concept {rel!r}")
        for fragment in _misquotes(concept.summary, concept.passage_ids, corpus):
            errors.append(
                f"concept {concept.id}: quoted text {fragment!r} is not found in any linked passage"
            )
        if concept.term and not _term_attested(concept.term, concept.passage_ids, corpus):
            errors.append(
                f"concept {concept.id}: term {concept.term!r} does not occur in the "
                "transliteration of any linked passage"
            )

    for story in corpus.stories:
        if story.source_id not in source_ids:
            errors.append(f"story {story.id}: unknown source {story.source_id!r}")
        for pid in story.excerpt_ids + story.related_passage_ids:
            if pid not in passages:
                errors.append(f"story {story.id}: unknown passage {pid!r}")
        if not story.excerpt_ids:
            errors.append(f"story {story.id}: no verbatim excerpts")
        foreign = [
            pid for pid in story.excerpt_ids if pid in passages and passages[pid].source_id != story.source_id
        ]
        if foreign:
            errors.append(f"story {story.id}: excerpts from another source: {foreign}")
        story_text = " ".join(
            [story.summary, story.dilemma, *story.lessons, *story.caveats]
            + [f"{c.choice} {c.consequence or ''}" for c in story.choices]
        )
        for fragment in _misquotes(story_text, story.excerpt_ids + story.related_passage_ids, corpus):
            errors.append(f"story {story.id}: quoted text {fragment!r} is not found in its passages")
        shown = {
            short_ref(passages[pid])
            for pid in story.excerpt_ids + story.related_passage_ids
            if pid in passages
        }
        for ref in dict.fromkeys(_cited_refs(story_text)):
            if ref not in shown:
                errors.append(f"story {story.id}: cites {ref}, which is not among its excerpts or related")

    report.stats = {
        "passages": len(corpus.passages),
        "by_source": dict(Counter(p.source_id for p in corpus.passages)),
        "provenance": dict(Counter(p.provenance_status for p in corpus.passages)),
        "cross_checks": dict(Counter(c.status for p in corpus.passages for c in p.cross_checks)),
        "corrections": dict(
            Counter(
                f"{c.field}:{'applied' if c.applied else 'kept printed'}"
                for p in corpus.passages
                for c in p.corrections
            )
        ),
        "concepts": len(corpus.concepts),
        "stories": len(corpus.stories),
    }
    return report


_QUOTED = re.compile(r'"([^"]+)"|“([^”]+)”')


def _misquotes(text: str, passage_ids: list[str], corpus: Corpus) -> list[str]:
    """Quoted phrases in editorial text must be verbatim from a linked passage.

    Fragments separated by an ellipsis are checked independently.
    """
    passages = corpus.passage_map()
    haystack = " ".join(passages[pid].translation for pid in passage_ids if pid in passages)
    haystack = re.sub(r"\s+", " ", haystack).lower()
    bad = []
    for match in _QUOTED.finditer(text):
        quote = match.group(1) or match.group(2) or ""
        for fragment in re.split(r"…|\.\.\.", quote):
            fragment = re.sub(r"\s+", " ", fragment).strip(" ,;:.").lower()
            if len(fragment) >= 4 and fragment not in haystack:
                bad.append(fragment)
    return bad


# References as editors write them, in parentheses, matched as the web app links
# them (web/src/components/CitedText.tsx): "(2.47)" for the Gita, "(2.62–2.63)",
# "(Kena 3.6)", "(Katha 1.2.1-1.2.2)", several separated by commas.
_REFERENCE_GROUP = re.compile(r"\(([^()]{1,80})\)")
_REFERENCE = re.compile(
    r"\b(Katha|Isha|Kena)\s+(\d+(?:\.\d+){0,2})(?:\s*[–-]\s*(?:(?:Katha|Isha|Kena)\s+)?(\d+(?:\.\d+){0,2}))?"
    r"|\b(\d{1,2})\.(\d{1,3})(?:\s*[–-]\s*(\d{1,2})\.(\d{1,3}))?\b"
)


def _cited_refs(text: str) -> list[str]:
    """Short references ("BG 2.47", "Kena 3.6") an editorial text cites; a range
    contributes both of its ends."""
    refs = []
    for group in _REFERENCE_GROUP.finditer(text):
        for m in _REFERENCE.finditer(group.group(1)):
            if m.group(1):
                refs += [f"{m.group(1)} {n}" for n in (m.group(2), m.group(3)) if n]
            else:
                refs.append(f"BG {m.group(4)}.{m.group(5)}")
                if m.group(6):
                    refs.append(f"BG {m.group(6)}.{m.group(7)}")
    return refs


def _term_attested(term: str, passage_ids: list[str], corpus: Corpus) -> bool:
    """A concept's Sanskrit term must appear in one of its linked verses, so the
    project never displays Sanskrit vocabulary that is not in the sources."""
    key = loose_roman(term).replace(" ", "")
    # Terms are given in stem form (abhyāsa) but occur inflected (abhyāsena).
    if len(key) > 4 and key.endswith("a"):
        key = key[:-1]
    passages = corpus.passage_map()
    for pid in passage_ids:
        passage = passages.get(pid)
        roman = (
            loose_roman(passage.transliteration).replace(" ", "")
            if passage and passage.transliteration
            else ""
        )
        if key in roman:
            return True
    return False


def render_markdown(report: ValidationReport) -> str:
    lines = ["# Corpus validation report", ""]
    lines.append(f"**Status:** {'OK' if report.ok else 'FAILED'}")
    lines.append("")
    lines.append("## Statistics")
    for key, value in report.stats.items():
        lines.append(f"- **{key}**: {value}")
    lines.append("")
    lines.append(f"## Errors ({len(report.errors)})")
    lines += [f"- {e}" for e in report.errors] or ["- none"]
    lines.append("")
    lines.append(f"## Needs review ({len(report.warnings)})")
    lines.append("")
    lines.append("These records are served, with their flag visible to users, until an editor resolves them.")
    lines.append("")
    lines += [f"- {w}" for w in report.warnings] or ["- none"]
    return "\n".join(lines) + "\n"
