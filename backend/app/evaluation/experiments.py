"""Retrieval experiments, run on the evaluation set without changing production retrieval.

    python -m app.evaluation.experiments hinglish            # Hinglish → Devanagari strategies
    python -m app.evaluation.experiments rerank --model M    # cross-encoder reranking (downloads M)
    python -m app.evaluation.experiments themes              # semantic theme routing settings
    python -m app.evaluation.experiments evidence            # confidence signals and labelling rules
    python -m app.evaluation.experiments language            # Hindi and Hinglish mechanisms
    python -m app.evaluation.experiments language-misses     # what each Hindi/Hinglish miss lacks (dev)
    python -m app.evaluation.experiments backends            # where in-memory and PostgreSQL differ (dev)
    python -m app.evaluation.experiments pglexical           # PostgreSQL lexical rankings, BM25 included
    python -m app.evaluation.experiments compounds           # in-memory index with hyphenated words' parts

Each strategy runs on the same cases, backend and candidate settings as the
baseline (production retrieval), and writes one JSON report per strategy with
`--out DIR`. Results are recorded in docs/EVALUATION.md. Choose settings on the
dev split; report the held-out test split as it comes out.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import unicodedata
from collections.abc import Callable, Iterator
from contextlib import contextmanager, nullcontext
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from app.corpus import Concept
from app.evaluation.retrieval import (
    Case,
    RetrieveFn,
    build_retriever,
    load_cases,
    production_retrieve,
    question_type,
    run,
)
from app.retrieval import hinglish, text
from app.retrieval.hybrid import (
    CONCEPT_MATCH_MAX,
    CONCEPT_MATCH_MIN,
    ConceptMatch,
    HybridRetriever,
    RetrievalResult,
    assess_evidence,
)
from app.storage import lexical
from app.storage.lexical import LexicalIndex
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
# Hindi and Hinglish: mechanisms, not word lists
# --------------------------------------------------------------------------


@contextmanager
def grieve_added() -> Iterator[None]:
    """Production synonyms, with the translation's verb ("grievest", "grieved", stem
    "griev") added wherever "grief" is a target: "grief" alone never matches it."""
    saved = dict(text.SYNONYMS)
    for key, targets in saved.items():
        if "grief" in targets:
            text.SYNONYMS[key] = (*targets, "grieve")
    text._SYNONYMS_BY_STEM.clear()
    try:
        yield
    finally:
        text.SYNONYMS.clear()
        text.SYNONYMS.update(saved)
        text._SYNONYMS_BY_STEM.clear()


def english_gloss(question: str) -> str | None:
    """For a Hindi or Hinglish question, the English the cross-lingual map gives its words."""
    folded = unicodedata.normalize("NFC", question)
    if not (text._DEVANAGARI_WORD.search(folded) or hinglish.is_hinglish(question)):
        return None
    tokens = text.tokenize(folded) + text._DEVANAGARI_WORD.findall(folded)
    words = [w for t in tokens for w in text.CROSS_LINGUAL.get(t, "").split()]
    return " ".join(dict.fromkeys(words)) or None


def language_strategies() -> dict[str, RetrieveFn]:
    def make(grief: bool, gloss: bool) -> RetrieveFn:
        def fn(
            r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
        ) -> RetrievalResult:
            extra = english_gloss(case.question) if gloss else None
            if isinstance(r, ConceptsAlsoFrom):
                r.extra = [extra] if extra else []
            with grieve_added() if grief else nullcontext():
                return r.retrieve(
                    question=case.question, queries=queries, concept_ids=concepts, top_k=k, channels=ch
                )

        return fn

    return {
        "production": make(False, False),
        "grief stem": make(True, False),
        "themes from gloss": make(False, True),
        "grief stem + gloss": make(True, True),
    }


# Hindi function words (Devanagari), for telling content words from grammar when
# measuring what the cross-lingual map leaves out. Analysis only.
_HINDI_FUNCTION_WORDS = """है हैं हूँ हूं था थी थे में की का के को से और या पर भी तो ही यह वह ये वे मैं मुझे मुझसे मेरा मेरी
    मेरे हम हमें हमारा तुम आप उस उसे उसका उसकी उनके उन्हें इस इसे इसका क्या क्यों कैसे कब कहाँ कौन कोई किसी
    कुछ सब बहुत नहीं न ना मत अब फिर जब तब कि लिए साथ बाद पहले कर करना करता करती करते करूँ करें रहा रही
    रहे जाता जाती जाते जा गया गई होता होती होते हो होना हुआ हुई सकता सकती सकते चाहिए अपना अपनी अपने एक दो
    बार बात लगता लगती"""
_HINDI_FUNCTION = frozenset(_HINDI_FUNCTION_WORDS.split())


def language_misses(cases: list[Case], k: int) -> list[dict[str, Any]]:
    """For each Hindi or Hinglish in-scope question that production retrieval
    misses: what the cross-lingual map did with its words, and what each channel
    did with the expected passages, so a root cause can be named before a fix."""
    import difflib

    base = build_retriever("memory")
    traced = Traced(base.repo, base.embedder, base.settings)
    passages = {p.id: p for p in base.repo.get_passages(sorted({pid for c in cases for pid in c.expected}))}
    keys = sorted(k for k in text.CROSS_LINGUAL if text._DEVANAGARI_WORD.fullmatch(k) is None)
    rows = []
    for case in cases:
        if case.out_of_scope or case.language not in ("hi", "hinglish"):
            continue
        result = traced.retrieve(question=case.question, top_k=k)
        expected = set(case.expected)
        if any(item.passage.id in expected for item in result.passages[:k]):
            continue
        folded = unicodedata.normalize("NFC", case.question)
        tokens = text.tokenize(folded) + text._DEVANAGARI_WORD.findall(folded)
        content = [
            t
            for t in tokens
            if t not in _HINDI_FUNCTION and t not in hinglish.MARKERS and t not in text.STOPWORDS
        ]
        mapped = [t for t in content if t in text.CROSS_LINGUAL]
        english = [
            t for t in content if t not in text.CROSS_LINGUAL and text._DEVANAGARI_WORD.fullmatch(t) is None
        ]
        unmapped_hindi = [
            t
            for t in content
            if t not in text.CROSS_LINGUAL and (text._DEVANAGARI_WORD.fullmatch(t) or t in hinglish.LEXICON)
        ]
        variants = {
            t: near[0]
            for t in content
            if t not in text.CROSS_LINGUAL and len(t) > 3
            for near in [difflib.get_close_matches(t, keys, n=1, cutoff=0.8)]
            if near
        }
        words = text.keywords(case.question)
        stems = set(text.stems(words))
        overlap = {
            pid: sorted(stems & set(text.stems(text.tokenize(passages[pid].translation))))
            for pid in case.expected
            if pid in passages
        }
        ranks = {
            name: first_rank(hits, expected)
            for name, hits in traced.lists
            if name in ("vector_raw", "lexical")
        }
        rows.append(
            {
                "id": case.id,
                "split": case.split,
                "language": case.language,
                "question": case.question,
                "mapped": mapped,
                "unmapped_hindi": unmapped_hindi,
                "english_words": english,
                "spelling_variants": variants,
                "keywords": words,
                "expected_words_shared": overlap,
                "lexical_rank": ranks.get("lexical"),
                "vector_rank": ranks.get("vector_raw"),
                "themes": [m.concept.id for m in result.concepts],
                "expected_themes": case.concepts,
                "theme_matched": bool(set(case.concepts) & {m.concept.id for m in result.concepts}),
            }
        )
    return rows


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
        self.best: dict[str, float] = {}  # case id → the model's highest score among its candidates

    def scores(self, question: str, documents: list[str]) -> list[float]:
        start = time.perf_counter()
        out = list(self.model.rerank(question, documents, batch_size=32))
        self.seconds += time.perf_counter() - start
        self.calls += 1
        return [float(s) for s in out]


def rerank_strategies(reranker: Reranker, pool: int) -> dict[str, RetrieveFn]:
    """Rerank the first `pool` production results (the same candidates for every
    strategy): always, or only when production labels the evidence uncertain."""

    def strategy(mode: str, when: frozenset[str] | None = None) -> RetrieveFn:
        def fn(
            r: HybridRetriever, case: Case, queries: list[str], concepts: list[str], k: int, ch: Any
        ) -> RetrievalResult:
            result = r.retrieve(
                question=case.question, queries=queries, concept_ids=concepts, top_k=pool, channels=ch
            )
            items = result.passages
            if mode == "baseline" or not items or (when is not None and result.evidence not in when):
                result.passages = items[:k]
                return result
            scores = reranker.scores(case.question, [item.passage.translation for item in items])
            reranker.best[case.id] = max(scores)
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

    return {
        "baseline": strategy("baseline"),
        "rerank": strategy("rerank"),
        "fuse": strategy("fuse"),
        "fuse-if-weak": strategy("fuse", frozenset({"weak"})),
        "fuse-unless-strong": strategy("fuse", frozenset({"weak", "moderate"})),
    }


# --------------------------------------------------------------------------
# Evidence: the signals behind the confidence label, and rules over them
# --------------------------------------------------------------------------


class Traced(HybridRetriever):
    """Production retrieval that keeps what it computed on the way: the ranked
    lists it fused, and the similarity of the question to every theme."""

    lists: list[tuple[str, list[Hit]]]
    theme_scores: list[float]

    def _match_concepts(
        self, question: str, vector: np.ndarray | None, model_ids: list[str]
    ) -> tuple[list[ConceptMatch], float]:
        hits = self.repo.concept_search(vector, 1000) if vector is not None else []
        self.theme_scores = [h.score for h in hits]  # best first
        return super()._match_concepts(question, vector, model_ids)

    def _fuse(
        self, lists: list[tuple[str, list[Hit]]], raw_vector_weight: float
    ) -> tuple[dict[str, float], dict[str, dict[str, int]]]:
        self.lists = lists
        return super()._fuse(lists, raw_vector_weight)


def corpus_stems() -> set[str]:
    """Stems of every word the lexical channel can match: translations, notes,
    chapter titles and the vocabulary of the passages' themes."""
    from app.corpus import load_corpus
    from app.ingestion.pipeline import PROCESSED_DIR

    corpus = load_corpus(PROCESSED_DIR)
    concepts = {c.id: c for c in corpus.concepts}
    stems: set[str] = set()
    for passage in corpus.passages:
        primary, secondary = text.search_fields(passage, concepts)
        stems.update(text.stem(word) for word in text.tokenize(f"{primary} {secondary}"))
    return stems


def evidence_signals(r: Traced, result: RetrievalResult, question: str, known: set[str]) -> dict[str, float]:
    """Production's signals plus cheap ones computed from the same retrieval."""
    s = dict(result.signals)
    themes = np.array(r.theme_scores or [0.0, 0.0])
    s["theme_gap"] = float(themes[0] - themes[1])
    s["theme_z"] = float((themes[0] - themes.mean()) / (themes.std() or 1.0))
    vector = np.array([h.score for name, hits in r.lists if name == "vector_raw" for h in hits] or [0.0])
    s["vector_top1"] = float(vector[0])
    s["vector_z"] = float((vector[0] - vector.mean()) / (vector.std() or 1.0))
    lexical = [hits for name, hits in r.lists if name == "lexical"]
    s["lexical_hits"] = float(len(lexical[0])) if lexical else 0.0
    top = result.passages[:5]
    s["top_score"] = top[0].score if top else 0.0
    s["top1_channels"] = float(len(top[0].channels)) if top else 0.0
    s["three_channel_top5"] = float(sum(1 for item in top if len(item.channels) >= 3))
    words = text.keywords(question)
    s["terms"] = float(len(words))
    s["known_terms"] = float(sum(1 for word in words if text.stem(word) in known))
    return s


EvidenceRule = Callable[[dict[str, float]], str]


def agreement_needs_closeness(minimum: float) -> EvidenceRule:
    """Production's rule, except that passages found by several channels count
    as evidence only when the question is semantically close to some passage
    (raw-question vector similarity of at least `minimum`). Without it, shared
    words alone ("rain", "moon", "won") make unrelated questions look answered.
    0.825 was chosen on the dev split: the most out-of-scope questions labelled
    weak while found in-scope questions labelled weak rose by at most one
    overall and in each language."""

    def rule(s: dict[str, float]) -> str:
        if s["roman_match"] >= 0.8 or s["model_concepts"] >= 1:
            return "strong"
        if s["best_concept_similarity"] >= 0.83:
            return "strong"
        agree = s["multi_channel_top5"] >= 2 and s["vector_top1"] >= minimum
        return "moderate" if s["best_concept_similarity"] >= CONCEPT_MATCH_MIN or agree else "weak"

    return rule


EVIDENCE_RULES: dict[str, EvidenceRule] = {
    # Before 2026-10-20: any two top-5 passages found by more than one channel were enough.
    "agreement alone": agreement_needs_closeness(0.0),
    "production": assess_evidence,  # agreement needs vector similarity 0.825
}


def evidence_rows(retriever: Traced, cases: list[Case], k: int) -> list[dict[str, Any]]:
    known = corpus_stems()
    rows = []
    for case in cases:
        start = time.perf_counter()
        result = retriever.retrieve(question=case.question, top_k=k)
        latency = (time.perf_counter() - start) * 1000
        ids = [item.passage.id for item in result.passages][:k]
        expected = set(case.expected)
        rows.append(
            {
                "id": case.id,
                "split": case.split,
                "language": case.language,
                "type": question_type(case),
                "out_of_scope": case.out_of_scope,
                "found": any(pid in expected for pid in ids),
                "found_at_5": any(pid in expected for pid in ids[:5]),
                "evidence": result.evidence,
                "retrieved": ids,
                "latency_ms": round(latency, 1),
                "signals": evidence_signals(retriever, result, case.question, known),
            }
        )
    return rows


def calibration(rows: list[dict[str, Any]], rule: EvidenceRule, split: str) -> dict[str, tuple[int, int]]:
    """How a confidence rule labels three kinds of question: out of scope; in scope
    with an expected passage in the top k (found); in scope without one (missed)."""
    chosen = [r for r in rows if split == "all" or r["split"] == split]
    groups = {
        "oos": [r for r in chosen if r["out_of_scope"]],
        "found": [r for r in chosen if not r["out_of_scope"] and r["found"]],
        "missed": [r for r in chosen if not r["out_of_scope"] and not r["found"]],
    }
    out = {}
    for name, group in groups.items():
        labels = [rule(r["signals"]) for r in group]
        out[f"{name}_weak"] = (labels.count("weak"), len(group))
        out[f"{name}_strong"] = (labels.count("strong"), len(group))
    return out


def calibration_table(rows: list[dict[str, Any]], rules: dict[str, EvidenceRule]) -> str:
    def cell(pair: tuple[int, int]) -> str:
        n, d = pair
        return f"{n:3d}/{d:<3d} {n / d if d else 0:.2f}"

    lines = ["rule                         split  oos weak       found weak     missed weak    oos strong"]
    for name, rule in rules.items():
        for split in ("dev", "test", "all"):
            c = calibration(rows, rule, split)
            lines.append(
                f"{name:28s} {split:5s}  {cell(c['oos_weak'])}  {cell(c['found_weak'])}  "
                f"{cell(c['missed_weak'])}  {cell(c['oos_strong'])}"
            )
    return "\n".join(lines)


# --------------------------------------------------------------------------
# PostgreSQL lexical ranking
# --------------------------------------------------------------------------

PG_RANKINGS = {
    "ts_rank_cd": "ts_rank_cd(search_tsv, q, 32)",  # production until 2026-10-20
    "ts_rank_cd/length": "ts_rank_cd(search_tsv, q, 2|32)",
    "ts_rank_cd/log-length": "ts_rank_cd(search_tsv, q, 1|32)",
    "ts_rank/log-length": "ts_rank(search_tsv, q, 1|32)",
}


class PgLexical:
    """A PostgresRepository whose lexical search ranks another way:
    - one of the expressions in PG_RANKINGS, over the stored tsvectors;
    - "bm25-sql": BM25 computed from the tsvectors (k1 1.2, b 0.75, notes and themes
      at 0.4, per-field document frequency and length, archaic stopwords left out
      of lengths). Close to, not the same as, the in-memory ranking: PostgreSQL
      stems before stopwords can be told apart, and splits hyphenated words;
    - "production": the shared BM25 index over the stored search text (production
      since 2026-10-20); "production+parts": the same, with hyphenated words' parts.
    Read-only: no schema change."""

    def __init__(self, base: Any, mode: str) -> None:
        self.base, self.mode = base, mode
        self._stats: dict[str, Any] | None = None
        self._parts: LexicalIndex | None = None

    def __getattr__(self, name: str) -> Any:
        return getattr(self.base, name)

    def lexical_search(self, words: list[str], limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        if self.mode == "production":
            return self.base.lexical_search(words, limit, source_ids)
        if self.mode == "production+parts":
            if self._parts is None:
                self._parts = with_parts(lambda: LexicalIndex(*_stored_texts(self.base)))
            return self._parts.search(words, limit, source_ids)
        terms = [w for w in words if re.match(r"^[a-z]+$", w)]
        if not terms:
            return []
        if self.mode == "bm25-sql":
            return bm25_hits(self.base, self.bm25_stats(), terms, limit, source_ids)
        rows = self.base._rows(
            f"""
            SELECT id, {PG_RANKINGS[self.mode]} AS score
            FROM passages, to_tsquery('english', %(q)s) q
            WHERE search_tsv @@ q
              AND (%(sources)s::text[] IS NULL OR source_id = ANY(%(sources)s))
            ORDER BY score DESC, position
            LIMIT %(limit)s
            """,
            {"q": " | ".join(terms), "sources": source_ids, "limit": limit},
        )
        return [Hit(r[0], float(r[1])) for r in rows]

    def bm25_stats(self) -> dict[str, Any]:
        if self._stats is None:
            self._stats = bm25_stats(self.base)
        return self._stats


def _stored_texts(repo: Any) -> tuple[list[str], list[str], list[str], list[str]]:
    rows = repo._rows(
        "SELECT p.id, p.source_id, p.search_primary, p.search_secondary FROM passages p "
        "JOIN sources s ON s.id = p.source_id ORDER BY s.sort_order, p.source_id, p.position"
    )
    return [r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows], [r[3] for r in rows]


def bm25_stats(repo: Any) -> dict[str, Any]:
    """Corpus statistics for BM25 over search_tsv: passage count, each passage's
    length in each field and the average, and each lexeme's document frequency."""
    skip = repo._rows(
        "SELECT coalesce(tsvector_to_array(to_tsvector('english', %(w)s)), '{}')",
        {"w": " ".join(sorted(text.STOPWORDS))},
    )[0][0]
    lengths = {
        r[0]: (int(r[1]), int(r[2]))
        for r in repo._rows(
            """
            SELECT p.id,
                   coalesce(sum(cardinality(array_positions(u.weights, 'A'))), 0),
                   coalesce(sum(cardinality(array_positions(u.weights, 'B'))), 0)
            FROM passages p
            LEFT JOIN LATERAL unnest(p.search_tsv) u ON u.lexeme <> ALL(%(skip)s)
            GROUP BY p.id
            """,
            {"skip": skip},
        )
    }
    df = {
        r[0]: (int(r[1]), int(r[2]))
        for r in repo._rows(
            """
            SELECT u.lexeme,
                   count(*) FILTER (WHERE 'A' = ANY(u.weights)),
                   count(*) FILTER (WHERE 'B' = ANY(u.weights))
            FROM passages p, unnest(p.search_tsv) u
            GROUP BY u.lexeme
            """
        )
    }
    n = len(lengths)
    avg = (sum(a for a, _ in lengths.values()) / n, sum(b for _, b in lengths.values()) / n)
    return {"n": n, "lengths": lengths, "avg": avg, "df": df}


def bm25_hits(
    repo: Any, stats: dict[str, Any], terms: list[str], limit: int, source_ids: list[str] | None
) -> list[Hit]:
    k1, b, secondary = 1.2, 0.75, 0.4
    rows = repo._rows(
        """
        WITH q AS (SELECT DISTINCT unnest(tsvector_to_array(to_tsvector('english', %(text)s))) AS lexeme)
        SELECT p.id, p.position, u.lexeme,
               coalesce(cardinality(array_positions(u.weights, 'A')), 0),
               coalesce(cardinality(array_positions(u.weights, 'B')), 0)
        FROM passages p, unnest(p.search_tsv) u
        WHERE p.search_tsv @@ to_tsquery('english', %(q)s)
          AND u.lexeme IN (SELECT lexeme FROM q)
          AND (%(sources)s::text[] IS NULL OR p.source_id = ANY(%(sources)s))
        """,
        {"text": " ".join(terms), "q": " | ".join(terms), "sources": source_ids},
    )
    n, avg = stats["n"], stats["avg"]
    scores: dict[str, float] = {}
    order: dict[str, int] = {}
    for pid, position, lexeme, tf_a, tf_b in rows:
        df_a, df_b = stats["df"].get(lexeme, (0, 0))
        dl_a, dl_b = stats["lengths"].get(pid, (0, 0))
        score = 0.0
        for tf, df_f, dl, avg_f, weight in (
            (tf_a, df_a, dl_a, avg[0], 1.0),
            (tf_b, df_b, dl_b, avg[1], secondary),
        ):
            if tf and df_f and avg_f:
                idf = math.log(1 + (n - df_f + 0.5) / (df_f + 0.5))
                score += weight * idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * dl / avg_f))
        scores[pid] = scores.get(pid, 0.0) + score
        order[pid] = position
    ranked = sorted(
        (pid for pid in scores if scores[pid] > 0), key=lambda pid: (-scores[pid], order[pid], pid)
    )
    return [Hit(pid, scores[pid]) for pid in ranked[:limit]]


def pg_lexical_strategies(modes: list[str]) -> dict[str, Callable[[HybridRetriever], HybridRetriever]]:
    def make(mode: str) -> Callable[[HybridRetriever], HybridRetriever]:
        return lambda base: HybridRetriever(PgLexical(base.repo, mode), base.embedder, base.settings)

    return {mode: make(mode) for mode in modes}


def doc_tokens_with_parts(value: str) -> list[str]:
    """The in-memory index's tokens, plus the parts of hyphenated words, as
    PostgreSQL indexes them: "self-control" also gives "self" and "control"."""
    out = []
    for token in text.tokenize(value):
        if token not in text.STOPWORDS:
            out.append(text.stem(token))
        if "-" in token:
            out += [text.stem(part) for part in token.split("-") if part and part not in text.STOPWORDS]
    return out


def with_parts(build: Callable[[], Any]) -> Any:
    """Build an index while the shared tokenizer also emits hyphenated words' parts."""
    production = lexical.doc_tokens
    lexical.doc_tokens = doc_tokens_with_parts
    try:
        return build()
    finally:
        lexical.doc_tokens = production


def memory_with_parts() -> HybridRetriever:
    """The in-memory backend, its BM25 index built with doc_tokens_with_parts."""
    from app.config import get_settings
    from app.corpus import load_corpus
    from app.ingestion.pipeline import PROCESSED_DIR
    from app.retrieval.embeddings import get_embedder
    from app.storage.memory import MemoryRepository

    settings, embedder = get_settings(), get_embedder()
    corpus = load_corpus(PROCESSED_DIR)
    cache = settings.embedding_cache_dir.parent / "embeddings"
    repo = with_parts(lambda: MemoryRepository(corpus, embedder, cache_dir=cache))
    return HybridRetriever(repo, embedder, settings)


# --------------------------------------------------------------------------
# Backends: where in-memory and PostgreSQL retrieval part ways
# --------------------------------------------------------------------------


def first_rank(hits: list[Hit], expected: set[str]) -> int | None:
    return next((i for i, h in enumerate(hits, start=1) if h.id in expected), None)


def backend_rows(cases: list[Case], k: int) -> list[dict[str, Any]]:
    """For each in-scope case: whether each backend finds an expected passage in the
    top k, and where the first expected passage ranks in each channel's list."""
    traced = {}
    for backend in ("memory", "postgres"):
        base = build_retriever(backend)
        traced[backend] = Traced(base.repo, base.embedder, base.settings)
    rows = []
    for case in cases:
        if case.out_of_scope:
            continue
        expected = set(case.expected)
        row: dict[str, Any] = {"id": case.id, "split": case.split, "language": case.language}
        for backend, r in traced.items():
            result = r.retrieve(question=case.question, top_k=k)
            row[backend] = {
                "found": any(item.passage.id in expected for item in result.passages[:k]),
                "channels": {
                    name: first_rank(hits, expected) for name, hits in r.lists if name != "concept_llm"
                },
                "lexical_top10": [h.id for name, hits in r.lists if name == "lexical" for h in hits[:10]],
            }
        rows.append(row)
    return rows


def backend_table(rows: list[dict[str, Any]]) -> str:
    both = sum(r["memory"]["found"] and r["postgres"]["found"] for r in rows)
    memory_only = [r for r in rows if r["memory"]["found"] and not r["postgres"]["found"]]
    postgres_only = [r for r in rows if r["postgres"]["found"] and not r["memory"]["found"]]
    overlap = [
        len(set(r["memory"]["lexical_top10"]) & set(r["postgres"]["lexical_top10"])) / 10
        for r in rows
        if r["memory"]["lexical_top10"] and r["postgres"]["lexical_top10"]
    ]
    neither = len(rows) - both - len(memory_only) - len(postgres_only)
    lines = [
        f"{len(rows)} in-scope questions: found by both {both}, memory only {len(memory_only)}, "
        f"postgres only {len(postgres_only)}, neither {neither}",
        f"lexical top-10 overlap between backends: mean {sum(overlap) / max(1, len(overlap)):.2f}",
        "first expected passage's rank per channel, memory -> postgres (- = not in the top 30):",
    ]
    for label, group in (("memory only", memory_only), ("postgres only", postgres_only)):
        for r in group:
            channels = sorted(set(r["memory"]["channels"]) | set(r["postgres"]["channels"]))
            ranks = "  ".join(
                f"{c} {r['memory']['channels'].get(c) or '-'}->{r['postgres']['channels'].get(c) or '-'}"
                for c in channels
            )
            lines.append(f"  [{label}] {r['id']:26s} {r['language']:8s} {ranks}")
    return "\n".join(lines)


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
            slug = re.sub(r"[^A-Za-z0-9.-]+", "-", name).strip("-")
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
    parser.add_argument(
        "experiment",
        choices=[
            "backends",
            "compounds",
            "evidence",
            "hinglish",
            "language",
            "language-misses",
            "pglexical",
            "rerank",
            "themes",
        ],
    )
    parser.add_argument(
        "--split", choices=["dev", "test", "all"], default="dev", help="backends: which cases"
    )
    parser.add_argument("--backend", choices=["memory", "postgres"], default="memory")
    parser.add_argument("--k", type=int, default=8)
    parser.add_argument(
        "--model", default="BAAI/bge-reranker-v2-m3-int8", help="rerank: a fastembed cross-encoder"
    )
    parser.add_argument(
        "--pool", type=int, default=30, help="rerank: candidates taken from production retrieval"
    )
    parser.add_argument(
        "--modes",
        default="baseline,rerank,fuse",
        help="rerank: which of baseline,rerank,fuse,fuse-if-weak,fuse-unless-strong to run",
    )
    parser.add_argument("--out", type=Path, help="write one JSON report per strategy into this directory")
    args = parser.parse_args(argv)

    if args.experiment == "language-misses":
        cases = [c for c in load_cases() if args.split == "all" or c.split == args.split]
        rows = language_misses(cases, args.k)
        for r in rows:
            print(f"{r['id']} [{r['language']}] {r['question']}")
            for key in ("mapped", "unmapped_hindi", "english_words", "spelling_variants", "keywords"):
                print(f"    {key}: {r[key]}")
            print(f"    expected passages' words shared with the keywords: {r['expected_words_shared']}")
            print(
                f"    lexical rank {r['lexical_rank']}, vector rank {r['vector_rank']} (of 30); "
                f"themes {r['themes']}, expected {r['expected_themes']}"
            )
        if args.out:
            args.out.mkdir(parents=True, exist_ok=True)
            report = json.dumps(rows, indent=1, ensure_ascii=False)
            (args.out / "language-misses.json").write_text(report, encoding="utf-8")
    elif args.experiment == "compounds":
        summaries = run_strategies(
            {"production": production_retrieve}, build_retriever("memory"), args.out, args.k
        )
        summaries.update(
            run_strategies({"hyphen parts": production_retrieve}, memory_with_parts(), args.out, args.k)
        )
        print(table(summaries))
    elif args.experiment == "pglexical":
        base = build_retriever("postgres")
        default = [*PG_RANKINGS, "bm25-sql", "production", "production+parts"]
        modes = args.modes.split(",") if args.modes != "baseline,rerank,fuse" else default
        summaries = {}
        for mode, make in pg_lexical_strategies(modes).items():
            summaries.update(run_strategies({mode: production_retrieve}, make(base), args.out, args.k))
        print(table(summaries))
    elif args.experiment == "backends":
        cases = [c for c in load_cases() if args.split == "all" or c.split == args.split]
        rows = backend_rows(cases, args.k)
        print(backend_table(rows))
        if args.out:
            args.out.mkdir(parents=True, exist_ok=True)
            (args.out / "backends.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    elif args.experiment == "evidence":
        base = build_retriever(args.backend)
        traced = Traced(base.repo, base.embedder, base.settings)
        rows = evidence_rows(traced, load_cases(), args.k)
        print(calibration_table(rows, EVIDENCE_RULES))
        if args.out:
            args.out.mkdir(parents=True, exist_ok=True)
            report = json.dumps(rows, indent=1, ensure_ascii=False)
            (args.out / "evidence.json").write_text(report, encoding="utf-8")
    elif args.experiment == "themes":
        base = build_retriever(args.backend)
        summaries = {}
        for name, params in theme_strategies().items():
            retriever = ThemeRouting(base, *params)
            summaries.update(run_strategies({name: production_retrieve}, retriever, args.out, args.k))
        print(table(summaries))
    elif args.experiment == "language":
        base = build_retriever(args.backend)
        themed = ConceptsAlsoFrom(base.repo, base.embedder, base.settings)
        print(table(run_strategies(language_strategies(), themed, args.out, args.k)))
    elif args.experiment == "hinglish":
        base = build_retriever(args.backend)
        themed = ConceptsAlsoFrom(base.repo, base.embedder, base.settings)
        strategies = hinglish_strategies(english_vocabulary())
        print(table(run_strategies(strategies, themed, args.out, args.k)))
    else:
        from app.config import get_settings

        reranker = Reranker(args.model, str(get_settings().embedding_cache_dir))
        modes = rerank_strategies(reranker, args.pool)
        hybrid = build_retriever(args.backend)
        n = len(load_cases())
        summaries, costs = {}, []
        for name in args.modes.split(","):
            calls, seconds = reranker.calls, reranker.seconds
            summaries.update(run_strategies({name: modes[name]}, hybrid, args.out, args.k))
            reranked = reranker.calls - calls
            per_call = 1000 * (reranker.seconds - seconds) / reranked if reranked else 0.0
            costs.append(
                f"{name:20s} reranked {reranked}/{n} questions ({reranked / n:.0%}), "
                f"{per_call:.0f} ms each ({args.pool} candidates)"
            )
        print(table(summaries))
        print("\n" + "\n".join(costs))
        if args.out and reranker.best:
            (args.out / "best-scores.json").write_text(json.dumps(reranker.best, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
