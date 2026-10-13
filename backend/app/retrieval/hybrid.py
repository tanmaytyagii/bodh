"""Hybrid retrieval: semantic + lexical + fuzzy-Sanskrit + concept routing,
fused with reciprocal rank fusion (RRF).

Channels
--------
* **vector**  — cosine similarity of query and passage embeddings, one ranked
  list per search query.
* **lexical** — full-text search over the translation (plus, at lower weight,
  translator's notes and editorial concept vocabulary), one list per query.
* **roman**   — trigram match of the raw question against the romanized
  Sanskrit, so a half-remembered verse ("karmanye vadhikaraste") finds itself.
* **concept** — passages of editorial concepts, chosen by the language model
  (when available) and/or matched semantically against the question.

Each ranked list contributes ``weight / (rrf_k + rank)`` to a passage's score.
Passages spoken by Krishna (the teaching) are mildly preferred over narration;
verses adjacent to an already selected verse are attached as its context
instead of taking a separate slot, which keeps results diverse.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from app.config import Settings
from app.corpus import Concept, Passage
from app.retrieval import text
from app.retrieval.embeddings import Embedder
from app.storage.repository import Hit, Repository

Channel = Literal["vector", "lexical", "roman", "concept", "pinned"]

CHANNEL_WEIGHTS: dict[str, float] = {
    "vector": 1.0,
    "lexical": 1.0,
    "roman": 4.0,
    "concept_llm": 2.0,
    "concept_semantic": 1.0,
    "pinned": 3.0,
}

# The teaching is Krishna's; Arjuna's questions and the narrators' frame are
# context. A mild prior, not a filter.
SPEAKER_PRIOR = {"Krishna": 1.0, "Arjuna": 0.8, "Sanjaya": 0.65, "Dhritarashtra": 0.5}

CONCEPT_MATCH_MIN = 0.80  # minimum cosine similarity for a semantic concept match
CONCEPT_MATCH_MAX = 3
STRONG_CONCEPT_SIMILARITY = 0.83


@dataclass
class ConceptMatch:
    concept: Concept
    score: float
    via: Literal["model", "semantic"]


@dataclass
class RetrievedPassage:
    passage: Passage
    score: float
    channels: dict[str, int] = field(default_factory=dict)  # channel → best rank
    concept_ids: list[str] = field(default_factory=list)
    context_before: list[Passage] = field(default_factory=list)
    context_after: list[Passage] = field(default_factory=list)
    absorbed_ids: list[str] = field(default_factory=list)  # adjacent hits shown as context


Evidence = Literal["strong", "moderate", "weak"]


@dataclass
class RetrievalResult:
    passages: list[RetrievedPassage]
    concepts: list[ConceptMatch]
    queries: list[str]
    # How well the corpus seems to address the question; "weak" means the
    # answer must say the sources do not speak to it directly.
    evidence: Evidence = "weak"
    signals: dict[str, float] = field(default_factory=dict)

    def allowed_ids(self) -> set[str]:
        """Passages the answer may cite: results and their visible context."""
        ids: set[str] = set()
        for item in self.passages:
            ids.add(item.passage.id)
            ids.update(p.id for p in item.context_before + item.context_after)
        return ids


class HybridRetriever:
    def __init__(self, repo: Repository, embedder: Embedder | None, settings: Settings) -> None:
        self.repo = repo
        self.embedder = embedder
        self.settings = settings

    def retrieve(
        self,
        *,
        question: str,
        queries: list[str] | None = None,
        concept_ids: list[str] | None = None,
        pinned_ids: list[str] | None = None,
        top_k: int | None = None,
        source_ids: list[str] | None = None,
        context_window: int = 1,
        channels: set[str] | None = None,
    ) -> RetrievalResult:
        """Retrieve passages for a question. `channels` limits which channels run
        (for ablation studies); by default all of them do."""
        enabled = channels or {"vector", "lexical", "roman", "concept"}
        top_k = top_k or self.settings.retrieval_top_k
        per_channel = self.settings.retrieval_candidates_per_channel
        all_queries = _dedupe([question, *(queries or [])])

        lists: list[tuple[str, list[Hit]]] = []
        vectors: dict[str, np.ndarray] = {}
        if self.embedder is not None:
            matrix = self.embedder.embed_queries(all_queries)
            vectors = dict(zip(all_queries, matrix, strict=True))

        for query in all_queries:
            if query in vectors and "vector" in enabled:
                channel = "vector_raw" if query == all_queries[0] else "vector"
                lists.append((channel, self.repo.vector_search(vectors[query], per_channel, source_ids)))
            words = text.keywords(query)
            if words and "lexical" in enabled:
                lists.append(("lexical", self.repo.lexical_search(words, per_channel, source_ids)))

        if "roman" in enabled:
            roman = self.repo.roman_search(text.query_roman_key(question), 5)
            if roman:
                lists.append(("roman", roman))

        concepts: list[ConceptMatch] = []
        best_concept = 0.0
        if "concept" in enabled:
            concepts, best_concept = self._match_concepts(question, vectors.get(question), concept_ids or [])
        for match in concepts:
            channel = "concept_llm" if match.via == "model" else "concept_semantic"
            lists.append((channel, [Hit(pid, 1.0) for pid in match.concept.passage_ids]))

        if pinned_ids:
            lists.append(("pinned", [Hit(pid, 1.0) for pid in pinned_ids]))

        # Semantic search on the raw wording helps knowledge questions ("the
        # verse about a lamp in a windless place") but adds noise to life
        # situations, where concept routing does better; its weight balances
        # the two on the evaluation set (docs/EVALUATION.md).
        fused, channel_ranks = self._fuse(lists, self.settings.retrieval_raw_vector_weight)
        passages = {p.id: p for p in self.repo.get_passages(list(fused))}
        for pid in list(fused):
            passage = passages.get(pid)
            if passage is None or (source_ids and passage.source_id not in source_ids):
                del fused[pid]
                continue
            fused[pid] *= SPEAKER_PRIOR.get(passage.speaker or "", 1.0)

        concept_of: dict[str, list[str]] = defaultdict(list)
        for match in concepts:
            for pid in match.concept.passage_ids:
                concept_of[pid].append(match.concept.id)

        selected: list[RetrievedPassage] = []
        for pid in sorted(fused, key=lambda k: (-fused[k], passages[k].position)):
            passage = passages[pid]
            anchor = _adjacent_to(passage, selected)
            if anchor is not None:
                anchor.absorbed_ids.append(pid)
                continue
            selected.append(
                RetrievedPassage(
                    passage=passage,
                    score=round(fused[pid], 6),
                    channels=channel_ranks[pid],
                    concept_ids=concept_of.get(pid, []),
                )
            )
            if len(selected) >= top_k:
                break

        for item in selected:
            before, after = self.repo.neighbors(item.passage.id, context_window, context_window)
            same_division = item.passage.division.get("chapter")
            item.context_before = [p for p in before if p.division.get("chapter") == same_division]
            item.context_after = [p for p in after if p.division.get("chapter") == same_division]

        signals = {
            "best_concept_similarity": round(best_concept, 4),
            "model_concepts": float(sum(1 for m in concepts if m.via == "model")),
            "roman_match": max(
                (h.score for name, hits in lists if name == "roman" for h in hits), default=0.0
            ),
            "multi_channel_top5": float(sum(1 for item in selected[:5] if len(item.channels) >= 2)),
        }
        return RetrievalResult(
            passages=selected,
            concepts=concepts,
            queries=all_queries,
            evidence=assess_evidence(signals),
            signals=signals,
        )

    def _match_concepts(
        self, question: str, vector: np.ndarray | None, model_ids: list[str]
    ) -> tuple[list[ConceptMatch], float]:
        matches: list[ConceptMatch] = []
        seen: set[str] = set()
        best = 0.0
        for concept_id in model_ids:
            concept = self.repo.get_concept(concept_id)
            if concept is not None and concept.id not in seen:
                matches.append(ConceptMatch(concept, 1.0, "model"))
                seen.add(concept.id)
        if vector is not None:
            for hit in self.repo.concept_search(vector, CONCEPT_MATCH_MAX):
                best = max(best, hit.score)
                if hit.score < CONCEPT_MATCH_MIN or hit.id in seen:
                    continue
                concept = self.repo.get_concept(hit.id)
                if concept is not None:
                    matches.append(ConceptMatch(concept, hit.score, "semantic"))
                    seen.add(hit.id)
        return matches, best

    def _fuse(
        self, lists: list[tuple[str, list[Hit]]], raw_vector_weight: float
    ) -> tuple[dict[str, float], dict[str, dict[str, int]]]:
        k = self.settings.rrf_k
        scores: dict[str, float] = defaultdict(float)
        ranks: dict[str, dict[str, int]] = defaultdict(dict)
        for channel, hits in lists:
            weight = raw_vector_weight if channel == "vector_raw" else CHANNEL_WEIGHTS.get(channel, 1.0)
            for rank, hit in enumerate(hits, start=1):
                scores[hit.id] += weight / (k + rank)
                name = "concept" if channel.startswith("concept") else channel.removesuffix("_raw")
                if name not in ranks[hit.id] or rank < ranks[hit.id][name]:
                    ranks[hit.id][name] = rank
        return dict(scores), dict(ranks)


def assess_evidence(signals: dict[str, float]) -> Evidence:
    """Heuristic confidence that the corpus addresses the question.

    Thresholds were set on the evaluation set (see docs/EVALUATION.md); they
    separate in-scope life questions from unrelated ones but are not a
    guarantee, so the answer prompt also asks the model to judge relevance.
    """
    if signals["roman_match"] >= 0.8 or signals["model_concepts"] >= 1:
        return "strong"
    if signals["best_concept_similarity"] >= STRONG_CONCEPT_SIMILARITY:
        return "strong"
    if signals["best_concept_similarity"] >= CONCEPT_MATCH_MIN or signals["multi_channel_top5"] >= 2:
        return "moderate"
    return "weak"


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out


def _adjacent_to(passage: Passage, selected: list[RetrievedPassage]) -> RetrievedPassage | None:
    for item in selected:
        other = item.passage
        if (
            other.source_id == passage.source_id
            and other.division.get("chapter") == passage.division.get("chapter")
            and abs(other.position - passage.position) == 1
        ):
            return item
    return None
