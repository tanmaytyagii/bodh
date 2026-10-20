"""Retrieval experiments, run on the evaluation set without changing production retrieval.

    python -m app.evaluation.experiments hinglish            # Hinglish → Devanagari strategies
    python -m app.evaluation.experiments rerank --model M    # cross-encoder reranking (downloads M)
    python -m app.evaluation.experiments themes              # semantic theme routing settings

Each strategy runs on the same cases, backend and candidate settings as the
baseline (production retrieval), and writes one JSON report per strategy with
`--out DIR`. Results are recorded in docs/EVALUATION.md. Choose settings on the
dev split; report the held-out test split as it comes out.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from app.corpus import Concept
from app.evaluation.retrieval import Case, RetrieveFn, build_retriever, production_retrieve, run
from app.retrieval import hinglish, text
from app.retrieval.hybrid import (
    CONCEPT_MATCH_MAX,
    CONCEPT_MATCH_MIN,
    ConceptMatch,
    HybridRetriever,
    RetrievalResult,
)
from app.storage.repository import Hit

# --------------------------------------------------------------------------
# Hinglish → Devanagari
# --------------------------------------------------------------------------


class ConceptsAlsoFrom(HybridRetriever):
    """Production retrieval, except that semantic theme matching also considers
    other renderings of the question (the best similarity per theme counts)."""

    extra: list[str]

    def _match_concepts(
        self, question: str, vector: np.ndarray | None, model_ids: list[str]
    ) -> tuple[list[ConceptMatch], float]:
        matches, best = super()._match_concepts(question, vector, model_ids)
        if self.embedder is None or not getattr(self, "extra", None):
            return matches, best
        seen = {m.concept.id: m for m in matches}
        for vec in self.embedder.embed_queries(self.extra):
            for hit in self.repo.concept_search(vec, CONCEPT_MATCH_MAX):
                best = max(best, hit.score)
                if hit.score < CONCEPT_MATCH_MIN:
                    continue
                if hit.id in seen:
                    seen[hit.id].score = max(seen[hit.id].score, hit.score)
                    continue
                concept: Concept | None = self.repo.get_concept(hit.id)
                if concept is not None:
                    seen[hit.id] = ConceptMatch(concept, hit.score, "semantic")
        return list(seen.values()), best


def english_vocabulary() -> set[str]:
    """Words to keep as typed when unknown words are transliterated: the
    translations' own vocabulary, stopwords, and the modern words in SYNONYMS."""
    from app.corpus import load_corpus
    from app.ingestion.pipeline import PROCESSED_DIR

    words = set(text.STOPWORDS) | set(text.SYNONYMS)
    for passage in load_corpus(PROCESSED_DIR).passages:
        words.update(text.tokenize(passage.translation))
    return words


def hinglish_strategies(english: set[str]) -> dict[str, RetrieveFn]:
    def rendering(case: Case, rule_based: bool) -> str | None:
        return hinglish.to_devanagari(case.question, english=english, rule_based_fallback=rule_based)

    def themes_from(r: HybridRetriever, extra: list[str]) -> None:
        # Set on every call, so no strategy inherits another case's rendering.
        if isinstance(r, ConceptsAlsoFrom):
            r.extra = extra

    def original(
        r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
    ) -> RetrievalResult:
        themes_from(r, [])
        return production_retrieve(r, case, queries, concepts, k, ch)

    def replace(rule_based: bool) -> RetrieveFn:
        def fn(
            r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
        ) -> RetrievalResult:
            themes_from(r, [])
            dev = rendering(case, rule_based)
            question = dev or case.question
            return r.retrieve(question=question, queries=queries, concept_ids=concepts, top_k=k, channels=ch)

        return fn

    def add(rule_based: bool, with_concepts: bool) -> RetrieveFn:
        def fn(
            r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
        ) -> RetrievalResult:
            dev = rendering(case, rule_based)
            extra = [dev] if dev else []
            themes_from(r, extra if with_concepts else [])
            return r.retrieve(
                question=case.question, queries=[*queries, *extra], concept_ids=concepts, top_k=k, channels=ch
            )

        return fn

    return {
        "original": original,
        "replace": replace(False),
        "add": add(False, False),
        "add+themes": add(False, True),
        "replace(rule-based)": replace(True),
        "add+themes(rule-based)": add(True, True),
    }


# --------------------------------------------------------------------------
# Semantic theme routing
# --------------------------------------------------------------------------


class ThemeRouting(HybridRetriever):
    """Production retrieval with different semantic theme routing: a minimum
    similarity, at most `limit` themes, only themes within `margin` of the best
    one, and the themes' weight in fusion. Model-chosen themes are unaffected."""

    def __init__(
        self, base: HybridRetriever, minimum: float, limit: int, margin: float, weight: float
    ) -> None:
        super().__init__(base.repo, base.embedder, base.settings)
        self.minimum, self.limit, self.margin, self.weight = minimum, limit, margin, weight

    def _match_concepts(
        self, question: str, vector: np.ndarray | None, model_ids: list[str]
    ) -> tuple[list[ConceptMatch], float]:
        matches, _ = super()._match_concepts(question, None, model_ids)  # model-chosen themes only
        best = 0.0
        if vector is not None:
            hits = self.repo.concept_search(vector, max(CONCEPT_MATCH_MAX, self.limit))
            best = max((h.score for h in hits), default=0.0)
            seen = {m.concept.id for m in matches}
            kept = [
                h
                for h in hits
                if h.score >= self.minimum and h.score >= best - self.margin and h.id not in seen
            ]
            for hit in kept[: self.limit]:
                concept: Concept | None = self.repo.get_concept(hit.id)
                if concept is not None:
                    matches.append(ConceptMatch(concept, hit.score, "semantic"))
        return matches, best

    def _fuse(
        self, lists: list[tuple[str, list[Hit]]], raw_vector_weight: float
    ) -> tuple[dict[str, float], dict[str, dict[str, int]]]:
        scores, ranks = super()._fuse(lists, raw_vector_weight)
        if self.weight != 1.0:
            # Production gives each semantic theme's list weight 1.0; move it to the chosen weight.
            k = self.settings.rrf_k
            for channel, hits in lists:
                if channel == "concept_semantic":
                    for rank, hit in enumerate(hits, start=1):
                        scores[hit.id] += (self.weight - 1.0) / (k + rank)
        return scores, ranks


def theme_strategies() -> dict[str, tuple[float, int, float, float]]:
    """name → (minimum similarity, at most, margin to the best, weight). The first is production."""
    grid = {"production (0.80, 3, any, 1.0)": (CONCEPT_MATCH_MIN, CONCEPT_MATCH_MAX, 1.0, 1.0)}
    for minimum in (0.80, 0.82, 0.84):
        for limit in (1, 2):
            for margin in (1.0, 0.01):
                for weight in (1.0, 0.5):
                    grid[f"min {minimum:.2f} max {limit} margin {margin:g} w {weight:g}"] = (
                        minimum,
                        limit,
                        margin,
                        weight,
                    )
    grid["no semantic themes"] = (1.01, 0, 0.0, 0.0)
    return grid


# --------------------------------------------------------------------------
# Cross-encoder reranking
# --------------------------------------------------------------------------


class Reranker:
    """A fastembed cross-encoder; scores (question, translation) pairs."""

    def __init__(self, model: str, cache_dir: str) -> None:
        from fastembed.rerank.cross_encoder import TextCrossEncoder

        self.model = TextCrossEncoder(model, cache_dir=cache_dir)
        self.seconds = 0.0
        self.calls = 0

    def scores(self, question: str, documents: list[str]) -> list[float]:
        start = time.perf_counter()
        out = list(self.model.rerank(question, documents, batch_size=32))
        self.seconds += time.perf_counter() - start
        self.calls += 1
        return [float(s) for s in out]


def rerank_strategies(reranker: Reranker, pool: int) -> dict[str, RetrieveFn]:
    """Rerank the first `pool` production results (the same candidates for every strategy)."""

    def strategy(mode: str) -> RetrieveFn:
        def fn(
            r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
        ) -> RetrievalResult:
            result = r.retrieve(
                question=case.question, queries=queries, concept_ids=concepts, top_k=pool, channels=ch
            )
            items = result.passages
            if mode == "baseline" or not items:
                result.passages = items[:k]
                return result
            scores = reranker.scores(case.question, [item.passage.translation for item in items])
            by_model = sorted(range(len(items)), key=lambda i: -scores[i])
            if mode == "rerank":
                order = by_model
            else:  # "fuse": reciprocal-rank fusion of the hybrid order and the model's order
                model_rank = {i: rank for rank, i in enumerate(by_model, start=1)}
                order = sorted(
                    range(len(items)), key=lambda i: -(1 / (60 + i + 1) + 1 / (60 + model_rank[i]))
                )
            result.passages = [items[i] for i in order][:k]
            return result

        return fn

    return {"baseline": strategy("baseline"), "rerank": strategy("rerank"), "fuse": strategy("fuse")}


# --------------------------------------------------------------------------


def run_strategies(
    strategies: dict[str, RetrieveFn], retriever: HybridRetriever, out: Path | None, k: int
) -> dict[str, dict[str, Any]]:
    summaries = {}
    for name, fn in strategies.items():
        results, summary = run(retrieve=fn, retriever=retriever, k=k)
        summaries[name] = summary
        if out:
            out.mkdir(parents=True, exist_ok=True)
            slug = name.replace("+", "-").replace("(", "-").replace(")", "")
            (out / f"{slug}.json").write_text(
                json.dumps(
                    {"summary": summary, "cases": [asdict(r) for r in results]}, indent=2, ensure_ascii=False
                ),
                encoding="utf-8",
            )
    return summaries


def table(summaries: dict[str, dict[str, Any]]) -> str:
    rows = ["strategy                 slice        n   hit@5  hit@8  mrr    misses"]
    for name, s in summaries.items():
        slices = {"all": s["overall"], **{f"{k}": v for k, v in s["by_split"].items()}}
        slices.update({k: v for k, v in s["by_language"].items()})
        for label, v in slices.items():
            misses = s["misses"]["n"] if label == "all" else ""
            metrics = f"{v['n']:4d}  {v['hit@5']:.3f}  {v['hit@k']:.3f}  {v['mrr']:.3f}"
            rows.append(f"{name:24s} {label:10s} {metrics}  {misses}")
    return "\n".join(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.experiments")
    parser.add_argument("experiment", choices=["hinglish", "rerank", "themes"])
    parser.add_argument("--backend", choices=["memory", "postgres"], default="memory")
    parser.add_argument("--k", type=int, default=8)
    parser.add_argument(
        "--model", default="BAAI/bge-reranker-v2-m3-int8", help="rerank: a fastembed cross-encoder"
    )
    parser.add_argument(
        "--pool", type=int, default=30, help="rerank: candidates taken from production retrieval"
    )
    parser.add_argument(
        "--modes", default="baseline,rerank,fuse", help="rerank: which of baseline,rerank,fuse to run"
    )
    parser.add_argument("--out", type=Path, help="write one JSON report per strategy into this directory")
    args = parser.parse_args(argv)

    if args.experiment == "themes":
        base = build_retriever(args.backend)
        summaries = {}
        for name, params in theme_strategies().items():
            retriever = ThemeRouting(base, *params)
            summaries.update(run_strategies({name: production_retrieve}, retriever, args.out, args.k))
        print(table(summaries))
    elif args.experiment == "hinglish":
        base = build_retriever(args.backend)
        themed = ConceptsAlsoFrom(base.repo, base.embedder, base.settings)
        strategies = hinglish_strategies(english_vocabulary())
        print(table(run_strategies(strategies, themed, args.out, args.k)))
    else:
        from app.config import get_settings

        reranker = Reranker(args.model, str(get_settings().embedding_cache_dir))
        modes = rerank_strategies(reranker, args.pool)
        chosen = {name: modes[name] for name in args.modes.split(",")}
        summaries = run_strategies(chosen, build_retriever(args.backend), args.out, args.k)
        print(table(summaries))
        if reranker.calls:
            per_call = 1000 * reranker.seconds / reranker.calls
            print(
                f"\nreranker: {reranker.calls} calls, {per_call:.0f} ms per question ({args.pool} candidates)"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
