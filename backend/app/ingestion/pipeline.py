"""Ingestion pipeline: fetch → parse → cross-check → validate → write.

The output in `data/processed/` is the single source of truth for both
storage backends: the Postgres loader and the in-memory store read it.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from app.config import DATA_DIR
from app.corpus import Corpus, save_corpus
from app.ingestion import curated
from app.ingestion.fetch import RAW_DIR
from app.ingestion.sources import gita_besant, gita_crosscheck, paramananda_upanishads
from app.ingestion.validate import ValidationReport, render_markdown, validate

PROCESSED_DIR = DATA_DIR / "processed"


def fetch_all(*, refresh: bool = False) -> None:
    gita_besant.fetch(refresh=refresh)
    gita_crosscheck.fetch(refresh=refresh)
    paramananda_upanishads.fetch(refresh=refresh)


def build_corpus() -> tuple[Corpus, list[str]]:
    issues: list[str] = []

    gita = gita_besant.build()
    issues += [f"bhagavad-gita {issue}" for issue in gita.issues]
    other = gita_crosscheck.load()
    gita_crosscheck.cross_check(gita.passages, other)
    issues += gita_crosscheck.apply_reviews(gita.passages, curated.load_reviews(), other)
    gita_source = gita_besant.SOURCE.model_copy(update={"divisions": gita.divisions})

    upanishads = paramananda_upanishads.build()
    issues += [f"upanishads {issue}" for issue in upanishads.issues]

    corpus = Corpus(
        sources=[gita_source, *upanishads.sources],
        editions=[gita_besant.EDITION, gita_crosscheck.EDITION, paramananda_upanishads.EDITION],
        passages=gita.passages + upanishads.passages,
        concepts=curated.load_concepts(),
        stories=curated.load_stories(),
    )
    _attach_concepts(corpus)
    issues += _attach_sensitivities(corpus, curated.load_sensitivities())
    return corpus, issues


def _attach_concepts(corpus: Corpus) -> None:
    """Record each passage's editorial concept ids in its metadata."""
    by_passage: dict[str, list[str]] = {}
    for concept in corpus.concepts:
        for pid in concept.passage_ids:
            by_passage.setdefault(pid, []).append(concept.id)
    for passage in corpus.passages:
        passage.metadata["concepts"] = by_passage.get(passage.id, [])


def build(output: Path = PROCESSED_DIR) -> ValidationReport:
    corpus, issues = build_corpus()
    report = validate(corpus)
    report.errors = [f"parse: {issue}" for issue in issues] + report.errors

    output.mkdir(parents=True, exist_ok=True)
    (output / "validation_report.md").write_text(render_markdown(report), encoding="utf-8")
    if not report.ok:
        return report

    save_corpus(corpus, output)
    manifest = {
        "built_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "passages_sha256": hashlib.sha256((output / "passages.jsonl").read_bytes()).hexdigest(),
        "stats": report.stats,
        "inputs": _input_checksums(),
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return report


def _input_checksums() -> dict[str, dict[str, str]]:
    inputs: dict[str, dict[str, str]] = {}
    for manifest in sorted(RAW_DIR.glob("*/manifest.json")):
        files = json.loads(manifest.read_text(encoding="utf-8"))
        inputs[manifest.parent.name] = {name: meta["sha256"] for name, meta in files.items()}
    for path in sorted(curated.CURATED_DIR.glob("*.yaml")):
        inputs.setdefault("curated", {})[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return inputs


def _attach_sensitivities(corpus: Corpus, notes: list[curated.Sensitivity]) -> list[str]:
    """Attach editorial misuse notes to passage metadata. Returns problems."""
    passages = corpus.passage_map()
    problems: list[str] = []
    for passage in corpus.passages:
        passage.metadata["sensitivity"] = []
    for note in notes:
        for pid in note.passage_ids:
            target = passages.get(pid)
            if target is None:
                problems.append(f"sensitivity {note.id}: unknown passage {pid}")
                continue
            target.metadata["sensitivity"].append(
                {"id": note.id, "note": note.note, "exclude_in_crisis": note.exclude_in_crisis}
            )
    return problems
