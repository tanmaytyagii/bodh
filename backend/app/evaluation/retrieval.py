"""Retrieval evaluation.

    python -m app.evaluation.retrieval                     # memory backend, all channels
    python -m app.evaluation.retrieval --backend postgres
    python -m app.evaluation.retrieval --channels vector   # ablation
    python -m app.evaluation.retrieval --with-llm          # use the LLM's query rewriting
    python -m app.evaluation.retrieval --split test        # only the held-out cases
    python -m app.evaluation.retrieval --dataset independent   # the frozen independent questions

Metrics (over in-scope questions):
  hit@k        some expected verse is among the top k results
  mrr          1 / rank of the first expected verse (0 if none in the top k)
  precision@k  share of the top k that is relevant (expected, or in an expected concept)
  concepts     share of expected concepts that were matched
  misses       in-scope questions with no expected verse in the top k
hit@k_ci is a 95% Wilson interval: on a slice of 7 questions it spans tens of points.
Out-of-scope questions report the evidence level the retriever assigned; `abstention`
counts out-of-scope questions labelled weak (higher is better) and found in-scope
questions labelled weak (lower is better), by split and language.

Cases marked `split: test` are held out: report on them, but never use them to
choose a setting. Everything else is the dev split. Independent questions
(independent.yaml) are evaluated only once frozen; their relevance is the
listed passages alone, with no credit for themes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
import time
from collections import defaultdict
from collections.abc import Callable
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
    split: str = "dev"


def question_type(case: Case) -> str:
    """life (a situation), knowledge (about the texts), lookup (a verse by its words) or out-of-scope."""
    if case.out_of_scope:
        return "out-of-scope"
    return case.category if case.category in ("knowledge", "lookup", "paraphrase", "ambiguous") else "life"


@dataclass
class CaseResult:
    id: str
    language: str
    category: str
    out_of_scope: bool
    split: str
    type: str
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
        split=case.split,
        type=question_type(case),
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


def wilson(successes: float, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a proportion; sound for small n and for 0 or n."""
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (round(max(0.0, centre - half), 3), round(min(1.0, centre + half), 3))


def summarize(results: list[CaseResult]) -> dict[str, Any]:
    def agg(rows: list[CaseResult]) -> dict[str, Any]:
        recalls = [r.concept_recall for r in rows if r.concept_recall is not None]
        return {
            "n": len(rows),
            "hit@5": round(statistics.mean(r.hit_at_5 for r in rows), 3),
            "hit@k": round(statistics.mean(r.hit_at_k for r in rows), 3),
            "hit@k_ci": wilson(sum(r.hit_at_k for r in rows), len(rows)),
            "mrr": round(statistics.mean(r.mrr for r in rows), 3),
            "precision@k": round(statistics.mean(r.precision_at_k for r in rows), 3),
            "concepts": round(statistics.mean(recalls), 3) if recalls else float("nan"),
        }

    def weak(rows: list[CaseResult]) -> dict[str, list[int]]:
        oos = [r for r in rows if r.out_of_scope]
        found = [r for r in rows if not r.out_of_scope and r.hit_at_k]
        return {
            "oos_weak": [sum(r.evidence == "weak" for r in oos), len(oos)],
            "found_weak": [sum(r.evidence == "weak" for r in found), len(found)],
        }

    def by(key: Callable[[CaseResult], str]) -> dict[str, dict[str, Any]]:
        groups: dict[str, list[CaseResult]] = defaultdict(list)
        for r in in_scope:
            groups[key(r)].append(r)
        return {name: agg(rows) for name, rows in sorted(groups.items())}

    in_scope = [r for r in results if not r.out_of_scope]
    evidence = defaultdict(lambda: defaultdict(int))  # type: ignore[var-annotated]
    for r in results:
        evidence["out_of_scope" if r.out_of_scope else "in_scope"][r.evidence] += 1
    latencies = sorted(r.latency_ms for r in results)
    misses = [r.id for r in in_scope if not r.hit_at_k]
    return {
        "overall": agg(in_scope) if in_scope else {},
        "misses": {"n": len(misses), "ids": misses},
        "by_language": by(lambda r: r.language),
        "by_type": by(lambda r: r.type),
        "by_split": by(lambda r: r.split),
        "by_category": by(lambda r: r.category),
        "evidence": {k: dict(v) for k, v in evidence.items()},
        "abstention": {
            "all": weak(results),
            **{
                split: weak([r for r in results if r.split == split])
                for split in sorted({r.split for r in results})
            },
            **{
                lang: weak([r for r in results if r.language == lang])
                for lang in sorted({r.language for r in results})
            },
        },
        "latency_ms_p50": round(statistics.median(latencies), 1),
        "latency_ms_p95": round(latencies[min(len(latencies) - 1, int(0.95 * len(latencies)))], 1),
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


# How an experiment retrieves for one case: (retriever, case, extra queries,
# model-chosen concepts, k, channels) → result. The default is production retrieval.
RetrieveFn = Callable[[HybridRetriever, Case, list[str], list[str], int, set[str] | None], RetrievalResult]


def production_retrieve(
    retriever: HybridRetriever,
    case: Case,
    queries: list[str],
    concept_ids: list[str],
    k: int,
    channels: set[str] | None,
) -> RetrievalResult:
    return retriever.retrieve(
        question=case.question, queries=queries, concept_ids=concept_ids, top_k=k, channels=channels
    )


def select_split(cases: list[Case], split: str) -> list[Case]:
    return cases if split == "all" else [c for c in cases if c.split == split]


def run(
    *,
    backend: str = "memory",
    k: int = 8,
    channels: set[str] | None = None,
    with_llm: bool = False,
    cases: list[Case] | None = None,
    split: str = "all",
    retrieve: RetrieveFn = production_retrieve,
    retriever: HybridRetriever | None = None,
) -> tuple[list[CaseResult], dict[str, Any]]:
    retriever = retriever or build_retriever(backend)
    cases = select_split(cases or load_cases(), split)
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
        result = retrieve(retriever, case, queries, concept_ids, k, channels)
        latency = (time.perf_counter() - start) * 1000
        results.append(score_case(case, result, k, relevant, latency))
    return results, summarize(results)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.retrieval")
    parser.add_argument("--backend", choices=["memory", "postgres"], default="memory")
    parser.add_argument("--k", type=int, default=8)
    parser.add_argument("--channels", help="comma-separated subset of vector,lexical,roman,concept")
    parser.add_argument("--with-llm", action="store_true", help="use the LLM to rewrite queries")
    parser.add_argument(
        "--split", choices=["all", "dev", "test"], default="all", help="test: the held-out cases"
    )
    parser.add_argument(
        "--dataset",
        choices=["main", "independent"],
        default="main",
        help="independent: the frozen independent questions (docs/INDEPENDENT_EVALUATION.md)",
    )
    parser.add_argument("--json", type=Path, help="write the full report to this file")
    parser.add_argument("--verbose", action="store_true", help="print every case")
    args = parser.parse_args(argv)

    channels = set(args.channels.split(",")) if args.channels else None
    cases, path, version = load_cases(), DATASET, ""
    if args.dataset == "independent":
        from app.evaluation import independent

        try:
            cases, version = independent.usable_cases()
        except independent.DatasetError as exc:
            print("The independent set cannot be evaluated:", *exc.problems, sep="\n  ", file=sys.stderr)
            return 2
        path = independent.INDEPENDENT
        if not cases:
            print("No labelled independent questions yet.", file=sys.stderr)
            return 2
    results, summary = run(
        backend=args.backend,
        k=args.k,
        channels=channels,
        with_llm=args.with_llm,
        cases=cases,
        split=args.split if args.dataset == "main" else "all",
    )
    summary["dataset"] = {
        "file": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16],
        "questions": len(results),
        **({"version": version} if version else {}),
    }
    if args.verbose:
        for r in results:
            flag = (
                "OOS" if r.out_of_scope else f"hit={int(r.hit_at_k)} mrr={r.mrr:.2f} p={r.precision_at_k:.2f}"
            )
            print(
                f"{r.id:28s} {r.language:8s} {r.split:4s} {flag:24s} evidence={r.evidence:8s} "
                f"{' '.join(r.retrieved[:5])}"
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
