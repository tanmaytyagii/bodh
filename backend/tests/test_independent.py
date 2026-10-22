import csv
import shutil
from pathlib import Path
from typing import Any

import pytest

from app.corpus import Corpus
from app.evaluation import independent
from app.evaluation.independent import DatasetError
from app.evaluation.retrieval import load_cases, run, wilson
from app.retrieval.hybrid import HybridRetriever

FIXTURES = Path(__file__).parent / "fixtures" / "independent"

# Vocabulary-map words that held-out questions use and no dev question does. All
# were in the maps on 2026-10-13, before the held-out questions were written
# (2026-10-19), so they are not fitted to them. A new word here needs the same check.
PREDATE_HELD_OUT = {
    "fail", "kaam", "knowledge", "lie", "mann", "mummy", "patience",
    "pleasure", "responsibility", "sach", "stressed", "tired", "डर", "दोस्त",
}  # fmt: skip
# k-mind-like-wind asks for BG 6.34 in words a theme summary has used since
# 2026-10-13: the question echoes the theme index, not the other way round.
ECHO_THE_THEME_INDEX = {"k-mind-like-wind"}


def entry(**changes: Any) -> dict[str, Any]:
    base = {
        "id": "ind-en-001",
        "question": "My manager takes credit for my work. How do I stay calm?",
        "language": "en",
        "category": "life",
        "author": "A1",
        "written_on": "2026-11-02",
        "authorship": "independent",
        "batch": "A1 2026-11-02 questions.csv sha256:0123456789ab",
        "expected": ["bg.2.47"],
        "out_of_scope": False,
        "labelled_by": "L1",
        "labelled_on": "2026-11-05",
        "decision": "single",
    }
    return {k: v for k, v in {**base, **changes}.items() if v is not None}


@pytest.fixture
def ids(corpus: Corpus) -> set[str]:
    return {p.id for p in corpus.passages}


def test_the_independent_set_is_valid_and_holds_no_fixtures(ids: set[str]) -> None:
    entries = independent.load_entries()
    assert independent.problems(entries, ids) == []
    assert all(e["authorship"] == "independent" for e in entries)


def test_validation_keeps_the_set_independent_and_complete(ids: set[str]) -> None:
    def found(**changes: Any) -> list[str]:
        return independent.problems([entry(**changes)], ids)

    def says(text: str, **changes: Any) -> bool:
        return any(text in p for p in found(**changes))

    assert found() == []
    assert says("theme index", concepts=["equanimity"])
    assert says("unknown passages ['bg.99.1']", expected=["bg.99.1"])
    assert says("same question as placements-jealousy", question=load_cases()[0].question)
    assert says("pseudonym", author="someone@example.com")
    assert says("pseudonym", labelled_by="Real Name")
    assert says("out of scope and also lists passages", out_of_scope=True)
    assert says("labelled_by", labelled_by=None)
    assert says("missing author", author="")
    assert says("missing authorship, batch", authorship=None, batch=None)
    assert says("synthetic test fixture is not an independent question", authorship="fixture")
    assert independent.problems([entry(authorship="fixture")], ids, allow_fixtures=True) == []
    assert says("written_on must be a date", written_on="last Tuesday")
    assert says("expected must be a list", expected="bg.2.47")
    assert says("lists a passage twice", expected=["bg.2.47", "bg.2.47"])
    assert says("category must be one of", category="philosophy")
    assert says("language must be one of", language="marathi")
    assert says("longer than", question="x" * 601)
    assert says("decision must be one of", decision="majority")
    assert any("duplicate id" in p for p in independent.problems([entry(), entry(question="Other?")], ids))

    # Each labeller's decision is kept; a disagreement needs an adjudication with a reason.
    l1 = {"by": "L1", "on": "2026-11-05", "expected": ["bg.2.47"], "out_of_scope": False}
    l2 = {"by": "L2", "on": "2026-11-06", "expected": ["bg.3.9"], "out_of_scope": False}
    assert says("must be adjudicated", annotations=[l1, l2], labelled_by="L1+L2", decision="agreed")
    assert says("explains itself in a note", annotations=[l1, l2], labelled_by="ADJ1", decision="adjudicated")
    adjudicated = entry(
        annotations=[l1, l2], labelled_by="ADJ1", decision="adjudicated", note="2.47 fits best"
    )
    assert independent.problems([adjudicated], ids) == []
    assert says("L1 labelled it twice", annotations=[l1, l1])
    assert says("names no passage", annotations=[{"by": "L1", "on": "2026-11-05", "out_of_scope": False}])


def test_unreadable_files_and_damaged_freeze_records_are_refused(tmp_path: Path) -> None:
    path, lock = tmp_path / "independent.yaml", tmp_path / "independent.lock"
    path.write_text("- id: [unclosed\n", encoding="utf-8")
    assert "not valid YAML" in independent.read_entries(path)[1][0]
    with pytest.raises(DatasetError):
        independent.load_entries(path)
    path.write_text("id: ind-en-001\n", encoding="utf-8")
    assert "must be a list" in independent.read_entries(path)[1][0]

    path.write_text("- id: ind-en-001\n", encoding="utf-8")
    lock.write_text("not a version line\n", encoding="utf-8")
    usable, why = independent.frozen_state(path, lock)
    assert not usable and "malformed" in why
    lock.write_text(f"{independent.checksum(path)} 2026-11-07 5\n", encoding="utf-8")
    usable, why = independent.frozen_state(path, lock)
    assert not usable and "records 5 questions" in why


def test_imports_are_all_or_nothing(tmp_path: Path) -> None:
    path = tmp_path / "independent.yaml"
    path.write_text("# header\n", encoding="utf-8")

    def attempt(rows: str) -> list[str]:
        source = tmp_path / "questions.csv"
        source.write_text(rows, encoding="utf-8")
        with pytest.raises(DatasetError) as error:
            independent.import_questions(source, "A1", "2026-11-02", path)
        assert path.read_text(encoding="utf-8") == "# header\n"  # nothing was added
        return error.value.problems

    assert any("missing column 'language'" in p for p in attempt("question\nWhy?\n"))
    assert any("unknown column" in p for p in attempt("question,language,email\nWhy?,en,x@y.z\n"))
    assert any("language 'marathi'" in p for p in attempt("question,language\nGood?,en\nKa?,marathi\n"))
    assert any("same question as" in p for p in attempt("question,language\nWhy me?,en\nwhy me,en\n"))
    known = load_cases()[0].question  # contains a comma, so it must be quoted
    assert any("same question as placements" in p for p in attempt(f'question,language\n"{known}",en\n'))
    assert any(
        "put a question that contains a comma" in p for p in attempt(f"question,language\n{known},en\n")
    )
    with pytest.raises(DatasetError, match="pseudonym"):
        independent.import_questions(tmp_path / "questions.csv", "Jane Doe", "2026-11-02", path)


def test_the_whole_workflow_on_synthetic_fixtures(
    tmp_path: Path, ids: set[str], retriever: HybridRetriever
) -> None:
    path, lock = tmp_path / "independent.yaml", tmp_path / "independent.lock"
    shutil.copy(independent.INDEPENDENT, path)  # the real header, no questions

    added = independent.import_questions(
        FIXTURES / "questions.csv", "FIXTURE-A", "2026-10-20", path, authorship="fixture"
    )
    assert [e["id"] for e in added][:4] == ["ind-en-001", "ind-en-002", "ind-en-003", "ind-hi-001"]
    assert all(e["batch"].startswith("FIXTURE-A 2026-10-20 questions.csv sha256:") for e in added)

    # The labelling sheet holds the questions and empty answers: no passage, theme or ranking.
    sheet = tmp_path / "sheet.csv"
    independent.write_sheet(sheet, independent.load_entries(path))
    rows = list(csv.DictReader(sheet.open(encoding="utf-8")))
    assert len(rows) == 8 and {r["expected"] for r in rows} == {""}
    assert not any(pid in sheet.read_text(encoding="utf-8") for pid in ("bg.", "katha.", "isha.", "kena."))

    assert independent.import_labels(FIXTURES / "labels-L1.csv", "FIXTURE-L1", "2026-10-20", ids, path) == 8
    assert independent.import_labels(FIXTURES / "labels-L2.csv", "FIXTURE-L2", "2026-10-21", ids, path) == 7
    with pytest.raises(DatasetError, match="already labelled"):
        independent.import_labels(FIXTURES / "labels-L1.csv", "FIXTURE-L1", "2026-10-20", ids, path)

    resolved, disagreements = independent.resolve(path)
    assert disagreements == ["ind-hinglish-002"]  # bg.4.17 against bg.3.9
    assert len(resolved) == 7
    by_id = {e["id"]: e for e in independent.load_entries(path)}
    assert by_id["ind-hi-001"]["decision"] == "single"  # FIXTURE-L2 left it blank
    assert by_id["ind-en-002"]["decision"] == "agreed"  # same passages, written differently
    assert by_id["ind-en-004"]["out_of_scope"] is True

    with pytest.raises(DatasetError, match="no final label"):
        independent.freeze(path, lock, passage_ids=ids, allow_fixtures=True)
    entries = independent.load_entries(path)
    for e in entries:
        if e["id"] == "ind-hinglish-002":
            e.update(
                expected=["bg.4.17", "bg.3.9"],
                out_of_scope=False,
                labelled_by="FIXTURE-ADJ",
                labelled_on="2026-10-22",
                decision="adjudicated",
                note="Both readings of karma are reasonable; both passages kept.",
            )
    independent.write_entries(entries, path)
    assert independent.read_entries(path)[0][0]["annotations"]  # each labeller's decision is kept

    independent.freeze(path, lock, passage_ids=ids, allow_fixtures=True)
    assert independent.frozen_state(path, lock)[0]
    # Frozen, but fixtures: the evaluator refuses to report them as independent.
    with pytest.raises(DatasetError, match="synthetic test fixture"):
        independent.usable_cases(path, lock, ids)

    cases = independent.to_cases(independent.load_entries(path))
    results, summary = run(cases=cases, retriever=retriever)
    assert len(results) == 8 and summary["overall"]["n"] == 6
    assert summary["abstention"]["all"]["oos_weak"][1] == 2

    path.write_text(path.read_text(encoding="utf-8").replace("Kya karma", "Kya karm"), encoding="utf-8")
    usable, why = independent.frozen_state(path, lock)
    assert not usable and "changed after it was frozen" in why


def test_small_slices_report_their_uncertainty() -> None:
    assert wilson(2, 7) == (0.082, 0.641)
    assert wilson(0, 8) == (0.0, 0.324)
    assert wilson(8, 8) == (0.676, 1.0)
    assert wilson(0, 0) == (0.0, 1.0)


def test_held_out_questions_do_not_shape_tuned_material() -> None:
    cases = load_cases() + independent.to_cases(independent.load_entries())
    assert set(independent.vocabulary_leaks(cases)) <= PREDATE_HELD_OUT
    assert {cid for cid, _ in independent.copied_phrases(cases)} <= ECHO_THE_THEME_INDEX
