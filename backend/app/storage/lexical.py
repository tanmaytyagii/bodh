"""BM25 over the passages' English search text, shared by both storage backends.

Two fields, each with its own document frequencies and lengths: the translation
(`search_primary`), and the translator's notes, chapter title and theme
vocabulary (`search_secondary`) at weight 0.4. Both backends build this index
from the same stored texts in the same order, so their lexical rankings are
identical. PostgreSQL's own ranking, `ts_rank_cd`, weighs a common word as
much as a rare one and ignores passage length; it found fewer expected
passages (docs/EVALUATION.md).
"""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Sequence

import numpy as np

from app.retrieval import text
from app.storage.repository import Hit

K1, B = 1.2, 0.75
SECONDARY_WEIGHT = 0.4


class BM25:
    def __init__(self, docs: list[list[str]]) -> None:
        self.tfs = [Counter(doc) for doc in docs]
        self.lengths = [len(doc) for doc in docs]
        self.avg = (sum(self.lengths) / len(docs)) if docs else 0.0
        df: Counter[str] = Counter()
        for tf in self.tfs:
            df.update(tf.keys())
        n = len(docs)
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}

    def scores(self, query: list[str]) -> np.ndarray:
        out = np.zeros(len(self.tfs), dtype=np.float64)
        if not self.avg:
            return out
        for term in set(query):
            idf = self.idf.get(term)
            if idf is None:
                continue
            for i, tf in enumerate(self.tfs):
                f = tf.get(term)
                if f:
                    norm = f + K1 * (1 - B + B * self.lengths[i] / self.avg)
                    out[i] += idf * f * (K1 + 1) / norm
        return out


def doc_tokens(value: str) -> list[str]:
    return [text.stem(t) for t in text.tokenize(value) if t not in text.STOPWORDS]


class LexicalIndex:
    """BM25 over passages given in corpus order; equal scores keep that order."""

    def __init__(
        self,
        ids: Sequence[str],
        source_ids: Sequence[str],
        primary: Sequence[str],
        secondary: Sequence[str],
    ) -> None:
        self.ids = list(ids)
        self.source_ids = np.array(list(source_ids))
        self.primary = BM25([doc_tokens(value) for value in primary])
        self.secondary = BM25([doc_tokens(value) for value in secondary])

    def search(self, words: list[str], limit: int, source_ids: list[str] | None = None) -> list[Hit]:
        query = text.stems(words)
        if not query or not self.ids:
            return []
        scores = self.primary.scores(query) + SECONDARY_WEIGHT * self.secondary.scores(query)
        scores = np.where(scores > 0, scores, -np.inf)
        if source_ids:
            scores = np.where(np.isin(self.source_ids, source_ids), scores, -np.inf)
        order = np.argsort(-scores, kind="stable")[:limit]
        return [Hit(self.ids[i], float(scores[i])) for i in order if np.isfinite(scores[i])]
