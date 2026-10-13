"""Editorial review of verses whose Sanskrit differs from the cross-check edition."""

import datetime as dt

import pytest

from app.corpus import Corpus, Passage
from app.ingestion.curated import Review
from app.ingestion.normalize import to_iast
from app.ingestion.sources.gita_crosscheck import UNREVIEWED_NOTE, apply_reviews
from app.ingestion.validate import validate


def flagged(corpus: Corpus, pid: str) -> tuple[list[Passage], Passage, dict[tuple[int, int], str]]:
    passages = [p.model_copy(deep=True) for p in corpus.passages if p.source_id == "bhagavad-gita"]
    passage = next(p for p in passages if p.id == pid)
    assert passage.provenance_status == "needs_review"
    theirs = passage.cross_checks[0].other_text
    assert theirs
    key = (int(passage.division["chapter"]), int(passage.division["verse"]))
    return passages, passage, {key: theirs}


def review(pid: str, decision: str, **extra: str) -> Review:
    return Review.model_validate(
        {
            "passage_id": pid,
            "decision": decision,
            "basis": "Compared the scan with a second printed edition.",
            "reviewer": "A. Editor",
            "date": dt.date(2026, 10, 10),
            **extra,
        }
    )


def test_keeping_the_printed_reading_marks_the_verse_reviewed(corpus: Corpus) -> None:
    passages, passage, other = flagged(corpus, "bg.2.26")
    sanskrit = passage.sanskrit
    assert apply_reviews(passages, [review("bg.2.26", "keep_printed")], other) == []
    assert passage.provenance_status == "reviewed"
    assert passage.sanskrit == sanskrit
    assert UNREVIEWED_NOTE not in passage.provenance_notes
    assert passage.provenance_notes[0].startswith("Reviewed (A. Editor, 2026-10-10)")


def test_a_correction_must_bring_the_verse_into_agreement(corpus: Corpus) -> None:
    passages, passage, other = flagged(corpus, "bg.17.6")  # differs in one word only
    fix = review("bg.17.6", "correct", printed="कर्शयन्तः", corrected="कर्षयन्तः")
    assert apply_reviews(passages, [fix], other) == []
    assert passage.provenance_status == "verified"
    assert passage.sanskrit and "कर्षयन्तः" in passage.sanskrit
    assert passage.transliteration == to_iast(passage.sanskrit)
    assert passage.corrections[-1].applied and "A. Editor" in passage.corrections[-1].basis
    assert passage.cross_checks[0].status in ("exact", "orthographic")


@pytest.mark.parametrize(
    ("pid", "decision", "extra", "problem"),
    [
        ("bg.17.6", "correct", {"printed": "कर्शयन्तः", "corrected": "कर्शयन्ति"}, "still differs"),
        ("bg.17.6", "correct", {"printed": "नास्ति", "corrected": "अस्ति"}, "does not occur"),
        ("bg.17.6", "correct", {}, "needs both"),
        ("bg.2.47", "keep_printed", {}, "not flagged for review (verified)"),
    ],
)
def test_invalid_reviews_are_rejected(
    corpus: Corpus, pid: str, decision: str, extra: dict[str, str], problem: str
) -> None:
    passages, passage, other = flagged(corpus, "bg.17.6")
    before = passage.model_copy(deep=True)
    problems = apply_reviews(passages, [review(pid, decision, **extra)], other)
    assert len(problems) == 1 and problem in problems[0]
    assert passage == before


def test_stale_transliteration_is_an_error(corpus: Corpus) -> None:
    broken = corpus.model_copy(deep=True)
    passage = next(p for p in broken.passages if p.id == "bg.2.47")
    passage.transliteration = (passage.transliteration or "").replace("karmaṇy", "karmany")
    assert any("bg.2.47: transliteration does not match" in e for e in validate(broken).errors)
