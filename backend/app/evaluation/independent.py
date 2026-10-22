"""Independent evaluation questions, and checks that keep held-out questions out of tuning.

    python -m app.evaluation.independent import questions.csv --author A1    # an author's questions
    python -m app.evaluation.independent sheet labels-L1.csv                 # questions only, to label
    python -m app.evaluation.independent passages texts.csv                  # the texts, to read
    python -m app.evaluation.independent labels labels-L1.csv --labeller L1  # one labeller's decisions
    python -m app.evaluation.independent resolve                             # agreed labels become final
    python -m app.evaluation.independent check                               # validate and count
    python -m app.evaluation.independent freeze                              # record the checksum
    python -m app.evaluation.independent leakage                             # audit tuned material
    python -m app.evaluation.retrieval --dataset independent                 # evaluate a frozen set

The protocol is in docs/INDEPENDENT_EVALUATION.md, and what authors and
labellers receive is in docs/independent/. In short: authors write questions
without seeing the theme index, the labelled questions, the vocabulary maps or
any retrieval output; labellers list the passages that address each question by
reading the texts, before any retrieval is run on it; disagreements are settled
and recorded; then the file is frozen, and the evaluator refuses a set that is
not frozen, has changed since, or holds anything but independent questions.
Labels name passages only: relevance never comes from the theme index, which
was written by the same people as the retrieval system.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.retrieval import DATASET, Case, load_cases

INDEPENDENT = Path(__file__).with_name("independent.yaml")
# One line per freeze: "<sha256> <date> <questions>". The last line is the current version.
LOCK = Path(__file__).with_name("independent.lock")

LANGUAGES = ("en", "hi", "hinglish")
CATEGORIES = ("life", "knowledge", "lookup", "paraphrase", "ambiguous", "out-of-scope")
# "fixture" marks synthetic questions used to test this tooling. They are never independent,
# and the real set refuses them.
AUTHORSHIP = ("independent", "fixture")
# How a final label was reached: one labeller, several who agreed, or a recorded adjudication.
DECISIONS = ("single", "agreed", "adjudicated")
QUESTION_FIELDS = ("id", "question", "language", "category", "author", "written_on", "authorship", "batch")
LABEL_FIELDS = ("expected", "out_of_scope", "labelled_by", "labelled_on", "decision")
ALLOWED = (*QUESTION_FIELDS, *LABEL_FIELDS, "annotations", "note")
ANNOTATION_FIELDS = ("by", "on", "expected", "out_of_scope", "note")
MAX_QUESTION = 600
# Questions this similar (after normalisation) are reported for a person to compare.
NEAR_DUPLICATE = 0.9

_PSEUDONYM = re.compile(r"^[A-Za-z][A-Za-z0-9-]{0,23}$")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_LOCK_LINE = re.compile(r"^([0-9a-f]{64}) (\d{4}-\d{2}-\d{2}) (\d+)$")
_YES = {"yes", "y", "true", "1"}
_NO = {"no", "n", "false", "0", ""}


class DatasetError(Exception):
    """A file that cannot be used; `problems` lists every reason."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


# --------------------------------------------------------------------------
# Reading and writing the set
# --------------------------------------------------------------------------


def read_entries(path: Path = INDEPENDENT) -> tuple[list[dict[str, Any]], list[str]]:
    """The questions in `path`, and any problem that stops them being read."""
    if not path.exists():
        return [], []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [], [f"{path.name} is not valid YAML: {exc}"]
    if data is None:
        return [], []
    if not isinstance(data, list):
        return [], [f"{path.name} must be a list of questions"]
    entries = [e for e in data if isinstance(e, dict)]
    bad = len(data) - len(entries)
    return entries, ([f"{path.name}: {bad} items are not questions (mappings)"] if bad else [])


def load_entries(path: Path = INDEPENDENT) -> list[dict[str, Any]]:
    entries, unreadable = read_entries(path)
    if unreadable:
        raise DatasetError(unreadable)
    return entries


def _header(path: Path) -> str:
    """The comment block at the top of the file, kept when the file is rewritten."""
    if not path.exists():
        return ""
    lines = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            lines.append(line)
        else:
            break
    return "\n".join(lines).rstrip() + "\n" if lines else ""


def _dump(entries: list[dict[str, Any]]) -> str:
    return yaml.safe_dump(entries, allow_unicode=True, sort_keys=False, width=1000)


def write_entries(entries: list[dict[str, Any]], path: Path = INDEPENDENT) -> None:
    header = _header(path)
    path.write_text(header + ("\n" if header else "") + (_dump(entries) if entries else ""), encoding="utf-8")


def _iso(value: Any) -> str | None:
    """A date as YAML may give it: a string, or a date when written unquoted."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and _ISO_DATE.match(value):
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            return None
    return None


def _normal(question: str) -> str:
    folded = unicodedata.normalize("NFC", question).lower()
    return " ".join(re.findall(r"\w+", folded))


def has_label(entry: dict[str, Any]) -> bool:
    """A final label: passages that address the question, or out of scope."""
    return bool(entry.get("expected")) or entry.get("out_of_scope") is True


def to_cases(entries: list[dict[str, Any]]) -> list[Case]:
    """The labelled questions, as evaluation cases. Unlabelled ones are not evaluated."""
    return [
        Case(
            id=e["id"],
            question=e["question"],
            category=e["category"],
            language=e["language"],
            expected=list(e.get("expected") or []),
            out_of_scope=bool(e.get("out_of_scope")),
            split="independent",
        )
        for e in entries
        if has_label(e)
    ]


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


def _label_problems(name: str, label: dict[str, Any], passage_ids: set[str], what: str) -> list[str]:
    out = []
    expected, oos = label.get("expected"), label.get("out_of_scope")
    if expected is not None and not (
        isinstance(expected, list) and all(isinstance(p, str) for p in expected)
    ):
        out.append(f"{name}: {what} expected must be a list of passage ids")
        expected = []
    if oos is not None and not isinstance(oos, bool):
        out.append(f"{name}: {what} out_of_scope must be true or false")
    if oos is True and expected:
        out.append(f"{name}: {what} is out of scope and also lists passages")
    unknown = [p for p in expected or [] if p not in passage_ids]
    if unknown:
        out.append(f"{name}: {what} names unknown passages {unknown}")
    if len(set(expected or [])) != len(expected or []):
        out.append(f"{name}: {what} lists a passage twice")
    return out


def problems(
    entries: list[dict[str, Any]],
    passage_ids: set[str],
    main: list[Case] | None = None,
    *,
    allow_fixtures: bool = False,
) -> list[str]:
    """Everything that makes the set unusable, incomplete or not independent."""
    main = load_cases() if main is None else main
    main_ids = {c.id for c in main}
    seen_questions = {_normal(c.question): c.id for c in main}
    out: list[str] = []
    ids: Counter[str] = Counter(str(e.get("id")) for e in entries)
    for e in entries:
        name = str(e.get("id", "?"))
        missing = [f for f in QUESTION_FIELDS if e.get(f) in (None, "")]
        if missing:
            out.append(f"{name}: missing {', '.join(missing)}")
        if "concepts" in e:
            out.append(f"{name}: labels name passages only; the theme index must not be used")
        unknown = sorted(set(e) - set(ALLOWED) - {"concepts"})
        if unknown:
            out.append(f"{name}: unknown fields {unknown}")
        if not name.startswith("ind-"):
            out.append(f"{name}: ids of independent questions start with 'ind-'")
        if ids[name] > 1 or name in main_ids:
            out.append(f"{name}: duplicate id")
        question = e.get("question")
        if not isinstance(question, str) or not question.strip():
            out.append(f"{name}: the question must be text")
            question = ""
        elif len(question) > MAX_QUESTION:
            out.append(f"{name}: the question is longer than {MAX_QUESTION} characters")
        if e.get("language") not in LANGUAGES:
            out.append(f"{name}: language must be one of {', '.join(LANGUAGES)}")
        if e.get("category") not in CATEGORIES:
            out.append(f"{name}: category must be one of {', '.join(CATEGORIES)}")
        authorship = e.get("authorship")
        if authorship not in AUTHORSHIP:
            out.append(f"{name}: authorship must be one of {', '.join(AUTHORSHIP)}")
        elif authorship == "fixture" and not allow_fixtures:
            out.append(f"{name}: a synthetic test fixture is not an independent question")
        for field in ("author", "labelled_by"):
            value = e.get(field)
            if value is not None and not all(_PSEUDONYM.match(p) for p in str(value).split("+")):
                out.append(f"{name}: {field} is a pseudonym (letters, digits, '-'), never a name or contact")
        for field in ("written_on", "labelled_on"):
            if e.get(field) is not None and _iso(e[field]) is None:
                out.append(f"{name}: {field} must be a date, YYYY-MM-DD")
        normal = _normal(question)
        if normal and normal in seen_questions:
            out.append(f"{name}: same question as {seen_questions[normal]}")
        if normal:
            seen_questions.setdefault(normal, name)
        out += _label_problems(name, e, passage_ids, "its label")
        annotations = e.get("annotations") or []
        if not isinstance(annotations, list) or not all(isinstance(a, dict) for a in annotations):
            out.append(f"{name}: annotations must be a list of labellers' decisions")
            annotations = []
        by = Counter(str(a.get("by")) for a in annotations)
        for a in annotations:
            who = str(a.get("by"))
            if set(a) - set(ANNOTATION_FIELDS):
                out.append(f"{name}: unknown annotation fields {sorted(set(a) - set(ANNOTATION_FIELDS))}")
            if not _PSEUDONYM.match(who):
                out.append(f"{name}: annotation by {who!r} is not a pseudonym")
            if by[who] > 1:
                out.append(f"{name}: {who} labelled it twice")
            if _iso(a.get("on")) is None:
                out.append(f"{name}: annotation by {who} has no date")
            if not (a.get("expected") or a.get("out_of_scope") is True):
                out.append(f"{name}: annotation by {who} names no passage and is not out of scope")
            out += _label_problems(name, a, passage_ids, f"annotation by {who}")
        if has_label(e):
            if not (e.get("labelled_by") and _iso(e.get("labelled_on"))):
                out.append(f"{name}: a label records who made it and when (labelled_by, labelled_on)")
            decision = e.get("decision")
            if decision not in DECISIONS:
                out.append(f"{name}: decision must be one of {', '.join(DECISIONS)}")
            elif decision != "adjudicated" and annotations and not _agree(annotations):
                out.append(f"{name}: its labellers disagree, so its label must be adjudicated, with a note")
            elif decision == "adjudicated" and not e.get("note"):
                out.append(f"{name}: an adjudicated label explains itself in a note")
    return list(dict.fromkeys(out))


def warnings(entries: list[dict[str, Any]], main: list[Case] | None = None) -> list[str]:
    """What a person should look at, though it does not make the set unusable."""
    main = load_cases() if main is None else main
    out = []
    texts = [(str(e.get("id")), _normal(str(e.get("question", "")))) for e in entries]
    others = texts + [(c.id, _normal(c.question)) for c in main]
    for i, (name, text) in enumerate(texts):
        for other, other_text in others[i + 1 :]:
            if text and other_text and text != other_text:
                ratio = difflib.SequenceMatcher(None, text, other_text).ratio()
                if ratio >= NEAR_DUPLICATE:
                    out.append(f"{name}: nearly the same question as {other} ({ratio:.2f})")
    single = [str(e.get("id")) for e in entries if has_label(e) and e.get("decision") == "single"]
    if single:
        out.append(f"{len(single)} questions have one labeller only ({single[0]}, ...)")
    languages = Counter(e.get("language") for e in entries)
    if entries and (languages["hi"] == 0 or languages["hinglish"] == 0):
        out.append("no Hindi or no Hinglish questions yet: collect those first")
    return out


# --------------------------------------------------------------------------
# Questions in, labelling sheets out, labels in
# --------------------------------------------------------------------------


def _read_csv(
    source: Path, required: tuple[str, ...], allowed: tuple[str, ...]
) -> list[tuple[int, dict[str, str]]]:
    """(row number, cells by column) for each row that is not blank or a comment
    (first cell starting with "#"). A file with a missing or unknown column, or a
    row with more cells than columns, is refused."""
    try:
        with source.open(encoding="utf-8-sig", newline="") as handle:
            table = list(csv.reader(handle))
    except (OSError, UnicodeDecodeError, csv.Error) as exc:
        raise DatasetError([f"{source.name}: cannot be read as UTF-8 CSV ({exc})"]) from exc
    columns = [c.strip().lower() for c in (table[0] if table else [])]
    issues = [f"{source.name}: missing column {c!r}" for c in required if c not in columns]
    issues += [f"{source.name}: unknown column {c!r}" for c in columns if c not in allowed]
    rows = []
    for number, cells in enumerate(table[1:], start=2):
        cells = [c.strip() for c in cells]
        if not any(cells) or cells[0].startswith("#"):
            continue
        if len(cells) > len(columns) and any(cells[len(columns) :]):
            issues.append(
                f"{source.name} row {number}: {len(cells)} cells for {len(columns)} columns "
                "(put a question that contains a comma in double quotes)"
            )
            continue
        rows.append((number, dict(zip(columns, cells + [""] * (len(columns) - len(cells)), strict=False))))
    if issues:
        raise DatasetError(issues)
    return rows


def import_questions(
    source: Path,
    author: str,
    written_on: str,
    path: Path = INDEPENDENT,
    *,
    authorship: str = "independent",
    main: list[Case] | None = None,
) -> list[dict[str, Any]]:
    """Append one author's questions, unlabelled. Columns: question, language, and
    optionally category (what the author meant to ask) and note. All or nothing:
    a file with any problem adds no question."""
    if not _PSEUDONYM.match(author):
        raise DatasetError([f"author {author!r} must be a pseudonym (letters, digits, '-'), such as A1"])
    if _iso(written_on) is None:
        raise DatasetError([f"written_on {written_on!r} must be a date, YYYY-MM-DD"])
    if authorship not in AUTHORSHIP:
        raise DatasetError([f"authorship must be one of {', '.join(AUTHORSHIP)}"])
    rows = _read_csv(source, ("question", "language"), ("question", "language", "category", "note"))
    entries = load_entries(path)
    main = load_cases() if main is None else main
    seen = {_normal(str(e.get("question", ""))): str(e.get("id")) for e in entries}
    seen.update({_normal(c.question): c.id for c in main})
    counts = Counter(str(e["id"]).split("-")[1] for e in entries if str(e.get("id", "")).count("-") >= 2)
    batch = (
        f"{author} {written_on} {source.name} sha256:{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}"
    )
    issues, added = [], []
    for line, row in rows:
        question, language = row.get("question", ""), row.get("language", "").lower()
        category = row.get("category", "").lower() or "life"
        where = f"{source.name} row {line}"
        if not question:
            issues.append(f"{where}: no question")
            continue
        if len(question) > MAX_QUESTION:
            issues.append(f"{where}: longer than {MAX_QUESTION} characters")
        if language not in LANGUAGES:
            issues.append(f"{where}: language {language!r} must be one of {', '.join(LANGUAGES)}")
            continue
        if category not in CATEGORIES:
            issues.append(f"{where}: category {category!r} must be one of {', '.join(CATEGORIES)}")
        normal = _normal(question)
        if normal in seen:
            issues.append(f"{where}: same question as {seen[normal]}")
            continue
        counts[language] += 1
        entry = {
            "id": f"ind-{language}-{counts[language]:03d}",
            "question": question,
            "language": language,
            "category": category,
            "author": author,
            "written_on": written_on,
            "authorship": authorship,
            "batch": batch,
        }
        if row.get("note"):
            entry["note"] = row["note"]
        seen[normal] = entry["id"]
        added.append(entry)
    if issues:
        raise DatasetError(issues)
    if added:
        with path.open("a", encoding="utf-8") as out:
            out.write("\n" + _dump(added))
    return added


SHEET_COLUMNS = ("id", "language", "category", "question", "expected", "out_of_scope", "note")


def write_sheet(target: Path, entries: list[dict[str, Any]]) -> int:
    """A labelling sheet: each question and empty answer columns. It holds no
    passage ids, themes or retrieval output, so nothing in it suggests an answer."""
    with target.open("w", encoding="utf-8", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(SHEET_COLUMNS)
        for e in entries:
            writer.writerow([e["id"], e["language"], e["category"], e["question"], "", "", ""])
    return len(entries)


def write_passages(target: Path) -> int:
    """The texts, for labellers to read and search: every passage's id, reference,
    speaker and translation, in order. Nothing editorial, nothing ranked."""
    from app.corpus import load_corpus
    from app.ingestion.pipeline import PROCESSED_DIR

    corpus = load_corpus(PROCESSED_DIR)
    titles = {s.id: s.title for s in corpus.sources}
    with target.open("w", encoding="utf-8", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(("id", "text", "reference", "speaker", "translation"))
        for p in corpus.passages:
            writer.writerow(
                (p.id, titles.get(p.source_id, p.source_id), p.ref, p.speaker or "", p.translation)
            )
    return len(corpus.passages)


def _passage_list(cell: str) -> list[str]:
    return [p for p in re.split(r"[\s,;]+", cell.strip()) if p]


def import_labels(
    source: Path, labeller: str, labelled_on: str, passage_ids: set[str], path: Path = INDEPENDENT
) -> int:
    """Record one labeller's decisions as annotations. Rows: id, expected (passage
    ids separated by spaces or commas), out_of_scope (yes or no), note. Questions a
    row leaves blank stay unlabelled by this labeller. All or nothing."""
    if not _PSEUDONYM.match(labeller):
        raise DatasetError([f"labeller {labeller!r} must be a pseudonym (letters, digits, '-'), such as L1"])
    if _iso(labelled_on) is None:
        raise DatasetError([f"labelled_on {labelled_on!r} must be a date, YYYY-MM-DD"])
    rows = _read_csv(source, ("id", "expected", "out_of_scope"), SHEET_COLUMNS)
    entries = load_entries(path)
    by_id = {str(e.get("id")): e for e in entries}
    issues: list[str] = []
    decisions: dict[str, dict[str, Any]] = {}
    for line, row in rows:
        name, where = row.get("id", ""), f"{source.name} row {line}"
        expected, oos_cell = _passage_list(row.get("expected", "")), row.get("out_of_scope", "").lower()
        if not expected and oos_cell in _NO:
            continue  # not labelled by this labeller
        if name not in by_id:
            issues.append(f"{where}: no question {name!r}")
            continue
        if name in decisions:
            issues.append(f"{where}: {name} appears twice")
            continue
        if oos_cell not in _YES | _NO:
            issues.append(f"{where}: out_of_scope must be yes or no, not {oos_cell!r}")
            continue
        oos = oos_cell in _YES
        if oos and expected:
            issues.append(f"{where}: {name} is out of scope and also lists passages")
        unknown = [p for p in expected if p not in passage_ids]
        if unknown:
            issues.append(f"{where}: unknown passages {unknown}")
        if any(a.get("by") == labeller for a in by_id[name].get("annotations") or []):
            issues.append(f"{where}: {labeller} has already labelled {name}")
        decision: dict[str, Any] = {
            "by": labeller,
            "on": labelled_on,
            "expected": expected,
            "out_of_scope": oos,
        }
        if row.get("note"):
            decision["note"] = row["note"]
        decisions[name] = decision
    if issues:
        raise DatasetError(issues)
    for name, decision in decisions.items():
        by_id[name].setdefault("annotations", []).append(decision)
    if decisions:
        write_entries(entries, path)
    return len(decisions)


def _agree(annotations: list[dict[str, Any]]) -> bool:
    keys = {(frozenset(a.get("expected") or []), a.get("out_of_scope") is True) for a in annotations}
    return len(keys) == 1


def resolve(path: Path = INDEPENDENT) -> tuple[list[str], list[str]]:
    """Make a final label wherever the labellers agree, or only one has labelled.
    Returns (resolved, disagreements). A disagreement is settled by a person: set
    expected or out_of_scope, labelled_by, labelled_on, decision: adjudicated and
    a note that gives the reason; the annotations stay as they were."""
    entries = load_entries(path)
    resolved, disagreements = [], []
    for e in entries:
        annotations = e.get("annotations") or []
        if has_label(e) or not annotations:
            continue
        if not _agree(annotations):
            disagreements.append(str(e["id"]))
            continue
        first = annotations[0]
        e["expected"] = list(first.get("expected") or [])
        e["out_of_scope"] = first.get("out_of_scope") is True
        e["labelled_by"] = "+".join(str(a["by"]) for a in annotations)
        e["labelled_on"] = max(_iso(a["on"]) or "" for a in annotations)
        e["decision"] = "single" if len(annotations) == 1 else "agreed"
        resolved.append(str(e["id"]))
    if resolved:
        write_entries(entries, path)
    return resolved, disagreements


# --------------------------------------------------------------------------
# Freezing
# --------------------------------------------------------------------------


def checksum(path: Path = INDEPENDENT) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else ""


def versions(lock: Path = LOCK) -> tuple[list[tuple[str, str, int]], list[str]]:
    """The frozen versions in `lock`, oldest first, and any malformed line."""
    if not lock.exists():
        return [], []
    found, bad = [], []
    for number, line in enumerate(lock.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        match = _LOCK_LINE.match(line.strip())
        if match:
            found.append((match.group(1), match.group(2), int(match.group(3))))
        else:
            bad.append(f"{lock.name} line {number} is not '<sha256> <date> <questions>'")
    return found, bad


def frozen_state(path: Path = INDEPENDENT, lock: Path = LOCK) -> tuple[bool, str]:
    """(usable, why). A set is evaluated only as it was when frozen."""
    found, bad = versions(lock)
    if bad:
        return False, f"{lock.name} is malformed ({bad[0]}); a set cannot be trusted with a damaged record."
    if not found:
        return False, f"{path.name} is not frozen: label every question, then run `freeze`."
    sha, frozen_on, count = found[-1]
    if sha != checksum(path):
        return False, (
            f"{path.name} changed after it was frozen on {frozen_on}. Results on an edited set are "
            "not independent; restore it, or freeze a new version and report it separately."
        )
    entries, unreadable = read_entries(path)
    if unreadable or len(entries) != count:
        return False, f"{lock.name} records {count} questions, but {path.name} has {len(entries)}."
    return (
        True,
        f"{path.name} frozen on {frozen_on} (version {len(found)}, sha256 {sha[:12]}, {count} questions)",
    )


def freeze(
    path: Path = INDEPENDENT,
    lock: Path = LOCK,
    today: date | None = None,
    *,
    passage_ids: set[str] | None = None,
    main: list[Case] | None = None,
    allow_fixtures: bool = False,
) -> str:
    """Append this version's checksum to the lock. Refuses a set with any problem,
    or with a question that has no final label."""
    entries = load_entries(path)
    if not entries:
        raise DatasetError(["there are no questions to freeze"])
    ids = passage_ids if passage_ids is not None else _corpus_ids()
    issues = problems(entries, ids, main, allow_fixtures=allow_fixtures)
    unlabelled = [str(e.get("id")) for e in entries if not has_label(e)]
    if unlabelled:
        issues.append(
            f"{len(unlabelled)} questions have no final label yet ({unlabelled[0]}, ...); run resolve"
        )
    _, bad = versions(lock)
    issues += bad
    if issues:
        raise DatasetError(issues)
    line = f"{checksum(path)} {(today or date.today()).isoformat()} {len(entries)}"
    with lock.open("a", encoding="utf-8") as out:
        out.write(line + "\n")
    return line


def usable_cases(
    path: Path = INDEPENDENT, lock: Path = LOCK, passage_ids: set[str] | None = None
) -> tuple[list[Case], str]:
    """The frozen, valid, independent questions and their version, or DatasetError."""
    usable, why = frozen_state(path, lock)
    if not usable:
        raise DatasetError([why])
    entries = load_entries(path)
    issues = problems(entries, passage_ids if passage_ids is not None else _corpus_ids())
    if issues:
        raise DatasetError(issues)
    return to_cases(entries), why


def _corpus_ids() -> set[str]:
    from app.corpus import load_corpus
    from app.ingestion.pipeline import PROCESSED_DIR

    return {p.id for p in load_corpus(PROCESSED_DIR).passages}


# --------------------------------------------------------------------------
# Leakage: held-out and independent questions must not shape what is tuned
# --------------------------------------------------------------------------

# Tuned material: the vocabulary maps, the prompts that rewrite questions, and
# the theme index. Fusion settings and thresholds are chosen on the dev split.
TUNED_FILES = (
    Path(__file__).parents[1] / "retrieval" / "text.py",
    Path(__file__).parents[1] / "generation" / "prompts.py",
    DATASET.parents[2] / "data" / "curated" / "concepts.yaml",
)


def _words(question: str) -> set[str]:
    from app.retrieval import text

    folded = unicodedata.normalize("NFC", question)
    return set(text.tokenize(folded)) | set(text._DEVANAGARI_WORD.findall(folded))


def held_out(cases: list[Case]) -> list[Case]:
    return [c for c in cases if c.split in ("test", "independent")]


def vocabulary_leaks(cases: list[Case]) -> dict[str, list[str]]:
    """Words of the vocabulary maps that held-out or independent questions use and
    no dev question does, with the questions that use them. Each is a candidate
    leak: a word added because a held-out question needed it."""
    from app.retrieval import text

    dev = set().union(*(_words(c.question) for c in cases if c.split == "dev"))
    vocabulary = set(text.SYNONYMS) | set(text.CROSS_LINGUAL)
    leaks: dict[str, list[str]] = {}
    for case in held_out(cases):
        for word in sorted((_words(case.question) & vocabulary) - dev):
            leaks.setdefault(word, []).append(case.id)
    return dict(sorted(leaks.items()))


def copied_phrases(cases: list[Case], n: int = 5) -> list[tuple[str, str]]:
    """Runs of `n` words from held-out or independent questions found in tuned material."""
    tuned = " ".join(" ".join(re.findall(r"\w+", p.read_text(encoding="utf-8").lower())) for p in TUNED_FILES)
    found = []
    for case in held_out(cases):
        words = re.findall(r"\w+", unicodedata.normalize("NFC", case.question).lower())
        for i in range(len(words) - n + 1):
            phrase = " ".join(words[i : i + n])
            if f" {phrase} " in f" {tuned} ":
                found.append((case.id, phrase))
                break
    return found


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.independent")
    parser.add_argument("--file", type=Path, default=INDEPENDENT, help="the set (default: independent.yaml)")
    parser.add_argument(
        "--lock", type=Path, default=LOCK, help="its freeze record (default: independent.lock)"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("import", help="append an author's questions from a CSV file, unlabelled")
    add.add_argument("csv", type=Path)
    add.add_argument("--author", required=True, help="a pseudonym, such as A1")
    add.add_argument("--written-on", default=date.today().isoformat())
    add.add_argument(
        "--fixture",
        action="store_true",
        help="synthetic questions for a rehearsal; the real set refuses them",
    )
    sheet = sub.add_parser("sheet", help="write a labelling sheet: the questions and empty answer columns")
    sheet.add_argument("csv", type=Path)
    texts = sub.add_parser("passages", help="write every passage's id and translation, for labellers")
    texts.add_argument("csv", type=Path)
    labels = sub.add_parser("labels", help="record one labeller's completed sheet")
    labels.add_argument("csv", type=Path)
    labels.add_argument("--labeller", required=True, help="a pseudonym, such as L1")
    labels.add_argument("--labelled-on", default=date.today().isoformat())
    sub.add_parser("resolve", help="turn agreed or single labels into final labels")
    sub.add_parser("check", help="validate the set and count it")
    freezing = sub.add_parser("freeze", help="record the set's checksum; evaluation needs a frozen set")
    freezing.add_argument(
        "--fixtures", action="store_true", help="allow synthetic questions (rehearsals only)"
    )
    sub.add_parser("leakage", help="held-out words in the vocabulary maps; copied phrases")
    args = parser.parse_args(argv)
    path, lock = args.file, args.lock

    try:
        if args.command == "import":
            authorship = "fixture" if args.fixture else "independent"
            added = import_questions(args.csv, args.author, args.written_on, path, authorship=authorship)
            print(f"Added {len(added)} questions by {args.author} ({authorship}), unlabelled.")
        elif args.command == "sheet":
            print(f"Wrote {write_sheet(args.csv, load_entries(path))} questions to {args.csv}.")
        elif args.command == "passages":
            print(f"Wrote {write_passages(args.csv)} passages to {args.csv}.")
        elif args.command == "labels":
            count = import_labels(args.csv, args.labeller, args.labelled_on, _corpus_ids(), path)
            print(f"Recorded {args.labeller}'s labels for {count} questions.")
        elif args.command == "resolve":
            resolved, disagreements = resolve(path)
            print(f"Final labels made for {len(resolved)} questions.")
            for name in disagreements:
                print(f"  {name}: the labellers disagree; adjudicate it (see docs/INDEPENDENT_EVALUATION.md)")
        elif args.command == "freeze":
            print(f"Frozen: {freeze(path, lock, allow_fixtures=args.fixtures)}")
        elif args.command == "check":
            return 1 if _check(path, lock) else 0
        else:
            cases = load_cases() + to_cases(load_entries(path))
            leaks, copied = vocabulary_leaks(cases), copied_phrases(cases)
            print(f"Vocabulary words used only by held-out or independent questions: {len(leaks)}")
            for word, ids in leaks.items():
                print(f"  {word:16s} {', '.join(ids)}")
            print(f"Phrases copied from them into tuned material: {len(copied)}")
            for cid, phrase in copied:
                print(f"  {cid}: {phrase!r}")
    except DatasetError as exc:
        print("Nothing was changed:", file=sys.stderr)
        for problem in exc.problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    return 0


def _check(path: Path = INDEPENDENT, lock: Path = LOCK) -> list[str]:
    entries, unreadable = read_entries(path)
    fixtures = any(e.get("authorship") == "fixture" for e in entries)
    found = unreadable + problems(entries, _corpus_ids(), allow_fixtures=fixtures and path != INDEPENDENT)
    for problem in found:
        print(problem)
    for note in warnings(entries):
        print(f"note: {note}")
    labelled = [e for e in entries if has_label(e)]
    print(f"{len(entries)} questions, {len(labelled)} with a final label")
    for field in ("language", "category", "author", "authorship", "decision"):
        print(f"  by {field}: {dict(Counter(e.get(field) for e in entries))}")
    print(frozen_state(path, lock)[1])
    return found


if __name__ == "__main__":
    sys.exit(main())
