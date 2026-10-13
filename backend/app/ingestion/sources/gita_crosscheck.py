"""Independent Devanagari text of the Gita, used only to cross-check.

We compare every verse of the primary edition (Besant, 1922) with the
`gita/gita` open dataset. Agreement after folding spelling conventions marks
the Sanskrit as verified; any real difference is recorded and the verse is
flagged for human review. Only the Sanskrit is used from this dataset — its
translations and word meanings belong to their own publishers.
"""

from __future__ import annotations

import difflib
import json
import re
from typing import Literal

from app.corpus import CrossCheck, Edition, EditionCorrection, Passage
from app.ingestion.curated import Review
from app.ingestion.fetch import SourceCache
from app.ingestion.normalize import clean_devanagari, orthographic_key, to_iast

EDITION_ID = "gita-json"
CACHE_NAME = "github-gita-json"
# Pinned to a commit so the cross-check is reproducible.
COMMIT = "700c015912aa3f17ec2f275b9cfdd4f04278f47f"
URL = f"https://raw.githubusercontent.com/gita/gita/{COMMIT}/data/verse.json"

EDITION = Edition(
    id=EDITION_ID,
    source_ids=["bhagavad-gita"],
    role="cross_check",
    language="sa",
    title="Bhagavad Gita in JSON — verse.json (Devanagari text only)",
    contributors="gita/gita open-source project contributors",
    year=None,
    publisher=None,
    license=(
        "Repository released under The Unlicense; the Sanskrit text is ancient and in "
        "the public domain. Only the Devanagari is used here."
    ),
    url=f"https://github.com/gita/gita/blob/{COMMIT}/data/verse.json",
    notes="Used to cross-check the primary edition's Sanskrit; not displayed as a source.",
)

# Speaker phrases, sometimes on their own line and sometimes glued to the
# verse ("अर्जुन उवाचएवं").
_SPEAKER = re.compile(r"(?:श्री\s*भगवानुवाच|(?:धृतराष्ट्र|सञ्जय|संजय|अर्जुन)\s*उवाच)\s*[।]?")
_VERSE_NUMBER = re.compile(r"[।॥]+\s*[\d०-९.]+\s*[।॥]+")


def fetch(cache: SourceCache | None = None, *, refresh: bool = False) -> SourceCache:
    cache = cache or SourceCache(CACHE_NAME)
    cache.get("verse.json", URL, refresh=refresh)
    return cache


def load(cache: SourceCache | None = None) -> dict[tuple[int, int], str]:
    cache = cache or SourceCache(CACHE_NAME)
    if cache.record("verse.json") is None:
        raise RuntimeError("verse.json has not been fetched. Run the fetch step first.")
    rows = json.loads(cache.path("verse.json").read_text(encoding="utf-8"))
    verses: dict[tuple[int, int], str] = {}
    for row in rows:
        text = _SPEAKER.sub("", str(row["text"]))
        text = _VERSE_NUMBER.sub(" ॥", text)
        verses[(int(row["chapter_number"]), int(row["verse_number"]))] = clean_devanagari(text)
    return verses


def _without_numbers(text: str) -> str:
    text = re.sub(r"[०-९\d]+", "", text)
    return re.sub(r"[\s।॥]+", " ", text).strip()


def describe_difference(ours: str, theirs: str) -> str:
    """Word-level description of how two readings differ."""
    a, b = _without_numbers(ours).split(), _without_numbers(theirs).split()
    parts = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        left, right = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        if orthographic_key(left) == orthographic_key(right):
            continue  # spelling convention only
        parts.append(f"{left or '—'} → {right or '—'}")
    return "; ".join(parts)


def cross_check(passages: list[Passage], other: dict[tuple[int, int], str]) -> None:
    """Annotate each Gita passage with a cross-check result and provenance status."""
    for passage in passages:
        if passage.source_id != "bhagavad-gita" or not passage.sanskrit:
            continue
        key = (int(passage.division["chapter"]), int(passage.division["verse"]))
        theirs = other.get(key)
        if theirs is None:
            passage.cross_checks.append(CrossCheck(edition_id=EDITION_ID, status="missing"))
            passage.provenance_status = "needs_review"
            passage.provenance_notes.append("Verse not found in the cross-check edition.")
            continue

        _settle_corrections(passage, theirs)
        # Settling may revert a correction; keep the transliteration in step.
        passage.transliteration = to_iast(passage.sanskrit)
        status = _compare(passage.sanskrit, theirs)

        passage.cross_checks.append(
            CrossCheck(
                edition_id=EDITION_ID,
                status=status,
                other_text=theirs if status != "exact" else None,
                detail=describe_difference(passage.sanskrit, theirs) if status != "exact" else None,
            )
        )

        if status in ("exact", "orthographic"):
            passage.provenance_status = "verified"
        else:
            passage.provenance_status = "needs_review"
            passage.provenance_notes.append(UNREVIEWED_NOTE)


UNREVIEWED_NOTE = (
    "Sanskrit differs from the cross-check edition; shown as printed in the primary edition until reviewed."
)


def apply_reviews(
    passages: list[Passage], reviews: list[Review], other: dict[tuple[int, int], str]
) -> list[str]:
    """Apply editors' decisions on verses flagged for review.

    `keep_printed` confirms the printed reading as a genuine variant and marks
    the verse `reviewed`. `correct` fixes a misprint, and is accepted only when
    the corrected verse agrees with the cross-check edition, so no Sanskrit
    enters the corpus without a published text behind it. Returns problems.
    """
    problems: list[str] = []
    by_id = {p.id: p for p in passages}
    for review in reviews:
        where = f"review of {review.passage_id}:"
        passage = by_id.get(review.passage_id)
        if passage is None or passage.sanskrit is None:
            problems.append(f"{where} no such verse with Sanskrit")
            continue
        if passage.provenance_status != "needs_review":
            problems.append(f"{where} the verse is not flagged for review ({passage.provenance_status})")
            continue
        signed = f"{review.reviewer}, {review.date.isoformat()}"
        others = [n for n in passage.provenance_notes if n != UNREVIEWED_NOTE]
        if review.decision == "keep_printed":
            passage.provenance_status = "reviewed"
            passage.provenance_notes = [f"Reviewed ({signed}): printed reading kept. {review.basis}", *others]
            continue

        if not review.printed or not review.corrected:
            problems.append(f"{where} a correction needs both `printed` and `corrected`")
            continue
        if review.printed not in passage.sanskrit:
            problems.append(f"{where} {review.printed!r} does not occur in the verse")
            continue
        theirs = other.get((int(passage.division["chapter"]), int(passage.division["verse"])))
        corrected = passage.sanskrit.replace(review.printed, review.corrected, 1)
        status = _compare(corrected, theirs) if theirs else "variant"
        if status == "variant":
            problems.append(f"{where} the corrected verse still differs from the cross-check edition")
            continue
        passage.sanskrit = corrected
        passage.transliteration = to_iast(corrected)
        passage.corrections.append(
            EditionCorrection(
                field="sanskrit",
                printed=review.printed,
                corrected=review.corrected,
                applied=True,
                basis=f"Corrected on editorial review ({signed}): {review.basis}",
            )
        )
        for check in passage.cross_checks:
            if check.edition_id == EDITION_ID:
                check.status = status
                check.detail = None
                check.other_text = theirs if status != "exact" else None
        passage.provenance_status = "verified"
        passage.provenance_notes = others
    return problems


def _compare(ours: str, theirs: str) -> Literal["exact", "orthographic", "variant"]:
    if _without_numbers(ours) == _without_numbers(theirs):
        return "exact"
    if orthographic_key(ours) == orthographic_key(theirs):
        return "orthographic"
    return "variant"


def _settle_corrections(passage: Passage, theirs: str) -> None:
    """Keep a transcriber's [sic] correction of the Sanskrit only when the
    independent edition supports it; revert it when the other edition has the
    printed reading instead."""
    assert passage.sanskrit is not None
    key = orthographic_key(theirs)
    for correction in passage.corrections:
        if correction.field != "sanskrit" or not correction.applied:
            continue
        if correction.corrected not in passage.sanskrit:
            continue
        printed_version = passage.sanskrit.replace(correction.corrected, correction.printed, 1)
        corrected_word = orthographic_key(correction.corrected)
        printed_word = orthographic_key(correction.printed)
        # Prefer the printed reading whenever the other edition supports it.
        if orthographic_key(printed_version) == key:
            passage.sanskrit = printed_version
            correction.applied = False
            correction.basis += " Not applied: the printed reading agrees with the cross-check edition."
        elif orthographic_key(passage.sanskrit) == key or (corrected_word in key and printed_word not in key):
            correction.basis += " Confirmed by the cross-check edition."
        elif printed_word in key and corrected_word not in key:
            passage.sanskrit = printed_version
            correction.applied = False
            correction.basis += " Not applied: the printed reading agrees with the cross-check edition."
        else:
            correction.basis += " Not confirmed by the cross-check edition."
