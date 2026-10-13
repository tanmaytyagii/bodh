"""Retrieval evaluation.

    python -m app.evaluation.retrieval                     # memory backend, all channels
    python -m app.evaluation.retrieval --backend postgres
    python -m app.evaluation.retrieval --channels vector   # ablation
    python -m app.evaluation.retrieval --with-llm          # use the LLM's query rewriting

Metrics (over in-scope questions):
  hit@k        some expected verse is among the top k results
  mrr          1 / rank of the first expected verse (0 if none in the top k)
  precision@k  share of the top k that is relevant (expected, or in an expected concept)
  concepts     share of expected concepts that were matched
Out-of-scope questions report the evidence level the retriever assigned.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import yaml

from app.config import get_settings
from app.retrieval.hybrid import HybridRetriever, RetrievalResult

DATASET = Path(__file__).with_name("dataset.yaml")


@dataclass
class Case:
    id: str
    question: str
    category: str
    language: str = "en"
    expected: list[str] = field(default_factory=list)
    concepts: list[str] = field(default_factory=list)
    out_of_scope: bool = False


@dataclass
class CaseResult:
    id: str
    language: str
    category: str
    out_of_scope: bool
    retrieved: list[str]
    hit_at_5: float
    hit_at_k: float
    mrr: float
    precision_at_k: float
    concept_recall: float | None
    matched_concepts: list[str]
    evidence: str
    latency_ms: float


def load_cases(path: Path = DATASET) -> list[Case]:
    return [Case(**item) for item in yaml.safe_load(path.read_text(encoding="utf-8"))]


def score_case(
    case: Case, result: RetrievalResult, k: int, relevant: set[str], latency_ms: float
) -> CaseResult:
    ids = [item.passage.id for item in result.passages][:k]
    expected = set(case.expected)
    first = next((i for i, pid in enumerate(ids, start=1) if pid in expected), None)
    matched = [m.concept.id for m in result.concepts]
    concept_recall = len(set(case.concepts) & set(matched)) / len(case.concepts) if case.concepts else None
    return CaseResult(
        id=case.id,
        language=case.language,
        category=case.category,
        out_of_scope=case.out_of_scope,
        retrieved=ids,
        hit_at_5=float(any(pid in expected for pid in ids[:5])),
        hit_at_k=float(first is not None),
        mrr=1.0 / first if first else 0.0,
        precision_at_k=(sum(pid in relevant for pid in ids) / len(ids)) if ids else 0.0,
        concept_recall=concept_recall,
        matched_concepts=matched,
        evidence=result.evidence,
        latency_ms=round(latency_ms, 1),
    )


def summarize(results: list[CaseResult]) -> dict[str, Any]:
    def agg(rows: list[CaseResult]) -> dict[str, float]:
        recalls = [r.concept_recall for r in rows if r.concept_recall is not None]
        return {
            "n": len(rows),
            "hit@5": round(statistics.mean(r.hit_at_5 for r in rows), 3),
            "hit@k": round(statistics.mean(r.hit_at_k for r in rows), 3),
            "mrr": round(statistics.mean(r.mrr for r in rows), 3),
            "precision@k": round(statistics.mean(r.precision_at_k for r in rows), 3),
            "concepts": round(statistics.mean(recalls), 3) if recalls else float("nan"),
        }

    in_scope = [r for r in results if not r.out_of_scope]
    by_language: dict[str, list[CaseResult]] = defaultdict(list)
    for r in in_scope:
        by_language[r.language].append(r)
    evidence = defaultdict(lambda: defaultdict(int))  # type: ignore[var-annotated]
    for r in results:
        evidence["out_of_scope" if r.out_of_scope else "in_scope"][r.evidence] += 1
    return {
        "overall": agg(in_scope),
        "by_language": {lang: agg(rows) for lang, rows in sorted(by_language.items())},
        "evidence": {k: dict(v) for k, v in evidence.items()},
        "latency_ms_p50": round(statistics.median(r.latency_ms for r in results), 1),
    }


def build_retriever(backend: str) -> HybridRetriever:
    settings = get_settings()
    from app.retrieval.embeddings import get_embedder

    embedder = get_embedder()
    if backend == "postgres":
        from app.storage.db import create_pool
        from app.storage.postgres import PostgresRepository

        repo: Any = PostgresRepository(create_pool(settings.database_url), embedder.model_id)
    else:
        from app.corpus import load_corpus
        from app.ingestion.pipeline import PROCESSED_DIR
        from app.storage.memory import MemoryRepository

        repo = MemoryRepository(
            load_corpus(PROCESSED_DIR), embedder, cache_dir=settings.embedding_cache_dir.parent / "embeddings"
        )
    return HybridRetriever(repo, embedder, settings)


def run(
    *,
    backend: str = "memory",
    k: int = 8,
    channels: set[str] | None = None,
    with_llm: bool = False,
    cases: list[Case] | None = None,
) -> tuple[list[CaseResult], dict[str, Any]]:
    retriever = build_retriever(backend)
    cases = cases or load_cases()
    understand = None
    if with_llm:
        from app.generation.service import understand_for_eval

        understand = understand_for_eval

    results = []
    for case in cases:
        relevant = set(case.expected)
        for concept_id in case.concepts:
            concept = retriever.repo.get_concept(concept_id)
            if concept:
                relevant.update(concept.passage_ids)
        queries, concept_ids = understand(case.question) if understand else ([], [])
        start = time.perf_counter()
        result = retriever.retrieve(
            question=case.question, queries=queries, concept_ids=concept_ids, top_k=k, channels=channels
        )
        latency = (time.perf_counter() - start) * 1000
        results.append(score_case(case, result, k, relevant, latency))
    return results, summarize(results)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.retrieval")
    parser.add_argument("--backend", choices=["memory", "postgres"], default="memory")
    parser.add_argument("--k", type=int, default=8)
    parser.add_argument("--channels", help="comma-separated subset of vector,lexical,roman,concept")
    parser.add_argument("--with-llm", action="store_true", help="use the LLM to rewrite queries")
    parser.add_argument("--json", type=Path, help="write the full report to this file")
    parser.add_argument("--verbose", action="store_true", help="print every case")
    args = parser.parse_args(argv)

    channels = set(args.channels.split(",")) if args.channels else None
    results, summary = run(backend=args.backend, k=args.k, channels=channels, with_llm=args.with_llm)
    if args.verbose:
        for r in results:
            flag = (
                "OOS" if r.out_of_scope else f"hit={int(r.hit_at_k)} mrr={r.mrr:.2f} p={r.precision_at_k:.2f}"
            )
            print(
                f"{r.id:26s} {r.language:8s} {flag:24s} evidence={r.evidence:8s} {' '.join(r.retrieved[:5])}"
            )
    print(json.dumps(summary, indent=2))
    if args.json:
        args.json.write_text(
            json.dumps(
                {"summary": summary, "cases": [asdict(r) for r in results]}, indent=2, ensure_ascii=False
            ),
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
