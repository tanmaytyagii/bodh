# Evaluation

This document covers two evaluations and the automated tests:

- **Retrieval:** does the app find passages that address the question, and does it say so when they don't? It needs no model and runs in seconds.
- **Answers:** does the full pipeline produce grounded, well-behaved guidance? It needs a configured model and makes real model calls.

Unless a section says otherwise:

- the retrieval figures were measured on 2026-10-20, on `dataset.yaml` with sha256 `f1df1fbc00c11af3…`;
- the answer figures were measured on 2026-10-10;
- both use the current corpus of 872 passages.

## Retrieval

```bash
make eval                                                                   # memory backend, all 226 questions
cd backend && .venv/bin/python -m app.evaluation.retrieval --split test     # only the held-out questions
.venv/bin/python -m app.evaluation.retrieval --backend postgres
.venv/bin/python -m app.evaluation.retrieval --channels lexical,concept     # ablation
.venv/bin/python -m app.evaluation.retrieval --with-llm                     # include the model's query rewriting
.venv/bin/python -m app.evaluation.retrieval --dataset independent          # frozen independent questions only
.venv/bin/python -m app.evaluation.experiments evidence|language|rerank     # the experiments below
.venv/bin/python -m app.evaluation.experiments backends|pglexical|compounds # in-memory against PostgreSQL
.venv/bin/python -m app.evaluation.experiments language-misses              # what each Hindi/Hinglish miss lacks
.venv/bin/python -m app.evaluation.independent check|leakage                # see INDEPENDENT_EVALUATION.md
```

Run them from `backend/` (or through `make`): the `app` package lives there, so `python -m app...` from the repository root fails with `ModuleNotFoundError: No module named 'app'`. The report ends with the dataset file and the first 16 characters of its sha256, so every result can be tied to a version of the questions.

### The question set

`backend/app/evaluation/dataset.yaml` has 226 questions: 178 in scope and 48 out of scope.

- 74 questions were written before 2026-10-19.
- 116 were added on 2026-10-19.
- 36 out-of-scope questions were added on 2026-10-20 (see [below](#confidence-and-abstention)).

| | English | Hindi (Devanagari) | Hinglish (romanized) | All |
| --- | --- | --- | --- | --- |
| Life situations | 95 | 21 | 23 | 139 |
| Knowledge about the texts | 32 | 2 | 1 | 35 |
| Verse lookups by their words | 4 | | | 4 |
| Out of scope | 30 | 9 | 9 | 48 |
| **All** | **161** | **32** | **33** | **226** |

Life situations cover career and study pressure, family, relationships, grief, anger, habits, decisions, purpose and spirituality. Knowledge questions ask about the Gita and the Katha, Isha and Kena Upanishads, and their imagery and episodes. Out-of-scope questions are practical, factual or technical ones the texts cannot answer: tax returns, recipes, weather, sport, code, trivia.

Each in-scope question lists two things:

- **`expected`:** verses that clearly address it. Every one was read against its question in the corpus before it was listed. The list is not exhaustive.
- **`concepts`:** the editorial themes that fit it.

A retrieved passage counts as relevant if it is in `expected` or belongs to one of the listed themes.

**Held-out split.** 66 questions carry `split: test`:

- 53 in scope: 38 English, 7 Hindi and 8 Hinglish;
- 13 out of scope.

They are held out: settings are chosen on the other 160 (`dev`), and the test split is only reported. The questions written before 2026-10-19 are all dev, because earlier settings were tuned on them. The 36 out-of-scope questions added on 2026-10-20 were split by hash, not by hand: `test` where sha256(id) is divisible by 3. That gave 9 held-out and 27 dev.

**Corrections.** One label was corrected, with the reason beside it in the file: `k-food` now also expects 17.7, where Krishna introduces the three kinds of food.

**Not independent.** Every question here, and every label, was written by the people who built the retrieval and its theme index. That includes the held-out ones. [INDEPENDENT_EVALUATION.md](INDEPENDENT_EVALUATION.md) describes how independent questions are collected, labelled and frozen. None has been collected yet.

### Metrics

Retrieval metrics are computed over in-scope questions, at k = 8: the number of passages an answer is built from. The no-key Ask view shows 6.

| Metric | Meaning |
| --- | --- |
| **hit@5**, **hit@8** | Share of questions with at least one expected verse in the top 5 or top 8 |
| **MRR** | Mean reciprocal rank of the first expected verse |
| **misses** | Questions with no expected verse in the top 8 |
| **precision@8** | Share of the top 8 that is relevant. Unlabelled relevant verses count as misses, so this is a lower bound. |
| **concept recall** | Share of the expected themes that retrieval matched |
| **latency** | Median and 95th-percentile retrieval time, embedding of the question included |

The evidence label is measured on three groups:

| Group | Meaning |
| --- | --- |
| **out of scope labelled weak** | The texts do not address the question, and retrieval says so. Higher is better. |
| **found labelled weak** | An expected verse is in the top 8, yet retrieval says the evidence is weak (false weak). Lower is better. |
| **missed labelled weak** | No expected verse in the top 8, and retrieval says so. Higher is better, but some misses do have relevant, unlabelled passages. |

The report breaks every metric down by split, language, question type and category. Every hit@8 also comes with a 95% Wilson interval (`hit@k_ci`), and `abstention` counts out-of-scope questions and found questions labelled weak, by split and language.

### Results without the model

These runs use the raw question only, as in the no-key mode. With a model, the understanding step adds rewritten queries and chosen themes; that path has not yet been measured with a capable model.

| Backend | Split | hit@5 | hit@8 (95% interval) | MRR | precision@8 | misses | p50 / p95 latency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL (default) | all | 0.685 | 0.742 (0.67–0.80) | 0.470 | 0.282 | 46 | 23 / 27 ms |
| | dev | 0.728 | 0.776 (0.69–0.84) | 0.533 | | 28 | |
| | test | 0.585 | 0.660 (0.53–0.77) | 0.322 | 0.236 | 18 | |
| In-memory | all | 0.680 | 0.742 (0.67–0.80) | 0.472 | 0.283 | 46 | 4 / 6 ms |
| | dev | 0.728 | 0.784 (0.70–0.85) | 0.537 | | 27 | |
| | test | 0.566 | 0.642 (0.51–0.76) | 0.321 | 0.238 | 19 | |

By language: hit@5 / hit@8 / MRR over all questions, and found / held-out questions (hit@8, with its 95% interval) on the held-out split alone:

| Language | In scope | In-memory, all | In-memory, held out | PostgreSQL, all | PostgreSQL, held out |
| --- | --- | --- | --- | --- | --- |
| English | 131 | 0.725 / 0.786 / 0.504 | 28 of 38 (58–85%) | 0.725 / 0.786 / 0.500 | 29 of 38 (61–87%) |
| Hindi | 23 | 0.652 / 0.652 / 0.489 | 2 of 7 (8–64%) | 0.652 / 0.652 / 0.489 | 2 of 7 (8–64%) |
| Hinglish | 24 | 0.458 / 0.583 / 0.285 | 4 of 8 (22–78%) | 0.500 / 0.583 / 0.285 | 4 of 8 (22–78%) |

The Hindi and Hinglish intervals span 50 points or more: these slices can show a large failure, but not a small change.

By type (in-memory): life situations 0.655 / 0.712 / 0.452, knowledge 0.743 / 0.829 / 0.534, lookups 1.000 / 1.000 / 0.646.

**How the backends differ.** Both rank lexical matches with the same BM25 index, so their lexical results are identical, scores included ([below](#the-postgresql-gap)). What still differs is the stored embeddings: PostgreSQL's were computed in different batches at ingest, so near-ties in vector search and theme matching can fall differently.

### What changed, and what each change did

**2026-10-20, later.** PostgreSQL's lexical ranking moved from `ts_rank_cd` to the BM25 index the in-memory backend uses ([below](#the-postgresql-gap)). On PostgreSQL:
- all in-scope questions: 0.652 / 0.702 / 0.440 (53 misses) → 0.685 / 0.742 / 0.470 (46);
- dev: 34 → 28 misses;
- held out: hit@8 0.642 → 0.660, MRR 0.315 → 0.322;
- out-of-scope questions labelled weak: 39 → 40 of 48.

The in-memory backend is unchanged.

**2026-10-20.** Three changes; none touched the held-out ranking metrics.

| Change | Effect |
| --- | --- |
| The evidence label needs semantic closeness before channel agreement counts ([below](#confidence-and-abstention)) | Labels only; rankings are identical |
| "grief" also maps to the translation's verb, "grieve" ("Thou grievest…", 2.11) | One dev Hinglish question found (`hl-grief`); in-memory misses 47 → 46, PostgreSQL 54 → 53. Held out: no change in any language. |
| "binge" removed from the synonym map | Added on 2026-10-19, it is used only by a held-out question ([leakage](#leakage)). That question's result did not change: rank 1 either way. |

**2026-10-19.** The baseline is production retrieval on the question set before any change, measured on that day's 190 questions; out-of-scope questions do not enter these metrics.

| Step (cumulative; in-memory) | dev hit@5 | test hit@5 | test hit@8 | test MRR | misses |
| --- | --- | --- | --- | --- | --- |
| Baseline | 0.624 | 0.472 | 0.566 | 0.314 | 59 |
| 1. Synonyms also found for other forms of a word ("cravings", "grudges") | 0.632 | 0.472 | 0.566 | 0.309 | 58 |
| 2. A few more words mapped to the translation's vocabulary ("charity" → alms, gift; "bright" → splendour; quarrel, smoking and drinking; तुलना, झगड़ा) | 0.656 | 0.491 | 0.585 | 0.315 | 53 |
| Label correction (`k-food`, above) | 0.664 | 0.491 | 0.585 | 0.315 | 52 |
| 3. Fusion: raw-question vector weight 0.5 → 0.25, `RRF_K` 60 → 30 | 0.720 | 0.566 | 0.642 | 0.321 | 47 |

- On that baseline, the earlier figures turned out to be optimistic (hit@5 0.686 on 74 questions): the new held-out questions scored much lower than the questions the settings had been tuned on.
- On PostgreSQL, the same steps take all-question hit@5 from 0.590 to 0.646, MRR from 0.400 to 0.438, misses from 62 to 54, and test hit@5 from 0.547 to 0.585.
- Steps 2 and 3 were chosen by looking at dev questions, so the dev gains are optimistic; the test columns are the honest measure. Step 3 was the best of a 12-setting grid on dev; on test it improved 9 questions and worsened 3.

### The PostgreSQL gap

Until 2026-10-20, PostgreSQL found fewer expected passages than the in-memory backend: 54 misses against 47 on the 178 in-scope questions. The diagnosis used only dev questions (`experiments backends`, `experiments pglexical`).

**Channel by channel** (dev, 125 in-scope questions; the last column covers all 160 dev questions):

| Channel alone | In-memory hit@8 / MRR | PostgreSQL hit@8 / MRR | Same top 8 on both |
| --- | --- | --- | --- |
| lexical | 84 / 0.499 | 81 / 0.418 | 22 of 160 |
| vector | 42 / 0.210 | 39 / 0.217 | 15 of 160 |
| theme | 62 / 0.314 | 61 / 0.308 | 144 of 160 |
| Sanskrit trigram | 2 / 0.016 | 2 / 0.016 | 160 of 160 |

The two backends disagreed on 11 dev questions:

- **9 found only in memory.** In 7 of them, PostgreSQL ranked the expected passage much lower in its lexical list; `coworker-credit-anger` fell from rank 2 to 26. The other 2 lost a theme match at the 0.80 threshold.
- **2 found only by PostgreSQL.**

**Lexical ranking was the main cause.** PostgreSQL ranked by `ts_rank_cd`, which measures how densely the query's words cover a passage. It has two gaps:

- **No inverse document frequency.** A word found in half the passages counts as much as a rare one.
- **No length normalisation.** Its flag 32 only rescales the score.

Checked directly, for "action | envy" it ranks "action action action and the fruit of action" (0.29) above "the man of envy turns from action" (0.17). It also gives a one-word passage and a fifteen-word one the same score. The in-memory backend's BM25 weighs rare words higher and normalises for length.

**Tokenisation differs too.**

- **Archaic words:** PostgreSQL's parser keeps "thou" and "hath", which the in-memory index drops.
- **Hyphenated words:** it indexes each part as well ("twice-born" also gives "twice" and "born").
- **Possessives:** it drops the possessive "s".
- **Stopwords:** the in-memory stopword list has 61 words beyond PostgreSQL's, removed before stemming. After stemming PostgreSQL cannot tell them apart from their other forms: "knowing" and "know" become the same lexeme.

**The stored embeddings differ slightly.** PostgreSQL's passage embeddings and the in-memory backend's agree to cosine 0.9992–0.9996: same model, same text, but computed in different batches. The model's output depends a little on batch composition:

- embedding all passages again reproduces the in-memory vectors exactly;
- embedding 40 alone moves them by up to 0.00055;
- neither reproduces PostgreSQL's, which were made at ingest (64 at a time, at an earlier date).

In this model's narrow similarity band, that is enough to reorder near-ties. Vector search's top 8 matched for only 15 of 160 dev questions, though hit@8 was similar (42 against 39): noise, not bias.

**Alternatives,** all on the PostgreSQL backend, dev, 125 in-scope questions:

| Lexical ranking | hit@5 / hit@8 / MRR | misses | English / Hindi / Hinglish found | out of scope weak | found weak | p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| `ts_rank_cd` (production until now) | 0.680 / 0.728 / 0.494 | 34 | 68 / 13 / 10 | 28 of 35 | 5 of 91 | 23 / 28 ms |
| `ts_rank_cd`, divided by length | 0.624 / 0.672 / 0.450 | 41 | 65 / 13 / 6 | 28 of 35 | 5 of 84 | 23 ms |
| `ts_rank_cd`, divided by log length | 0.680 / 0.760 / 0.501 | 30 | 72 / 13 / 10 | 28 of 35 | 5 of 95 | 23 ms |
| `ts_rank`, divided by log length | 0.696 / 0.736 / 0.527 | 33 | 71 / 13 / 8 | 28 of 35 | 5 of 92 | 23 ms |
| BM25 computed in SQL from the tsvectors | 0.728 / 0.776 / 0.528 | 28 | 74 / 13 / 10 | 28 of 35 | 6 of 97 | 23 / 29 ms |
| **BM25 index over the stored texts, shared with the in-memory backend** | **0.728 / 0.776 / 0.533** | **28** | 74 / 13 / 10 | **29 of 35** | 6 of 97 | **21 / 25 ms** |
| the same, also indexing hyphenated words' parts | 0.736 / 0.776 / 0.529 | 28 | 74 / 13 / 10 | 28 of 35 | 6 of 97 | 22 / 28 ms |

(English of 93, Hindi of 16, Hinglish of 16.)

- **BM25 in SQL** agrees with the in-memory ranking on 89% of top-10 positions; the top 10 is identical for 33 of 152 dev questions. The tokenisation differences above keep it from matching.
- **The shared index** returns identical results on both backends: the same top 30, ids and scores to nine decimals, for all 211 questions that produce keywords, with and without a source filter. It builds in about 35 ms once, and a lexical query takes 0.3 ms instead of 1–2 ms in SQL.

**Decision: the shared index.** It had the best dev MRR, gives identical rankings and is the fastest. The held-out questions were then measured once, against `ts_rank_cd`:

- hit@5 unchanged at 0.585;
- hit@8 0.642 → 0.660 (19 → 18 misses);
- MRR 0.315 → 0.322;
- English 28 → 29 of 38; Hindi 2 of 7 and Hinglish 4 of 8 unchanged;
- out-of-scope weak unchanged at 11 of 13;
- 9 questions better, 7 worse.

For comparison, BM25 in SQL left held-out hit@8 unchanged, and Hinglish fell from 4 to 3 of 8.

**How it works.** `PostgresRepository` builds the index from `search_primary` and `search_secondary`, in corpus order, on first use (`storage/lexical.py`).

- **Refresh:** it rebuilds the index when the passages' count or latest update changes, checked at most every 30 seconds. After `make ingest`, the API searches the new text within 30 seconds.
- **No schema change:** `search_tsv` and its index remain; nothing ranks by them any more.
- **Tests** (`tests/test_lexical.py`):
  - rare words outweigh common ones;
  - length is normalised;
  - notes and themes count less than the translation;
  - ties keep corpus order;
  - PostgreSQL rebuilds its index after a reload;
  - when a database holding the current corpus is running, both backends return identical results.

**Not adopted: indexing hyphenated words' parts.** The in-memory index keeps "self-control" whole, but queries split it into "self" and "control". So 207 hyphenated words in 167 passages can never be matched, including "self-control", "self-knowledge" and "one-pointed", and "self-subdual" 47 times in the theme vocabulary. Indexing the parts as well:

- in memory, dev misses 27 → 26 (MRR 0.537 → 0.540; 5 questions better, 3 worse);
- on PostgreSQL, dev misses unchanged at 28 (MRR 0.533 → 0.529).

That is inconclusive, so it was not adopted. It is worth testing again on independent questions.

**Vector differences remain.** Making the stored embeddings match exactly would mean embedding both backends in the same batches, which changes either the stored embeddings or the in-memory cache. It was not done.

### Confidence and abstention

`assess_evidence` labels each result strong, moderate or weak. The label matters most without a model:

- "weak" becomes "limited" evidence in Ask;
- it adds "these matches are weak — the texts may not address this directly" in Explore.

With a model, the understanding step recognises out-of-scope questions itself, and the label is a hint in the answer prompt.

**Why half the out-of-scope questions looked answered.** On 2026-10-19 only 6 of the 12 out-of-scope questions were labelled weak. With 12 there was too little to tune or test a rule on, so 36 more were written before any signal was analysed. They were split by hash, as above.

Tracing the 11 dev out-of-scope questions still labelled moderate showed two causes. 6 were moderate through channel agreement alone, 2 through theme similarity alone, and 3 through both.

- **Channel agreement on shared words.** "Moderate" needed only two of the top five passages to be found by more than one channel. Unrelated questions share words with the texts, so the vector and lexical channels agree:
  - "Will it rain in Delhi tomorrow?" finds the verses about rain;
  - "How far is the moon from the earth?" finds "among the stars I am the moon";
  - "Who won the cricket world cup in 2011?" finds victory in battle.
- **Theme similarity at the routing threshold.** The embedding model compresses similarities into a narrow band: out-of-scope questions reach 0.80, the threshold for matching a theme.

**Which cheap signals tell them apart.** Area under the ROC curve on the dev split (0.5 is chance, 1.0 perfect):

| Signal | found vs out of scope | found vs missed |
| --- | --- | --- |
| Question words the corpus or the vocabulary maps know | 0.94 | 0.71 |
| Raw-question vector similarity to the closest passage | 0.94 | 0.50 |
| Best theme similarity | 0.93 | 0.59 |
| Fused score of the top passage | 0.91 | 0.70 |
| Top-5 passages found by two or more channels | 0.83 | 0.71 |
| Cross-encoder's best score (bge-reranker-v2-m3, 30 candidates; 1.2 s) | 0.89 | 0.56 |

These separate two questions that need separate answers:

- **Is the question one the texts address?** Several cheap signals tell that well (0.91–0.94).
- **Did retrieval find the right passage?** Nothing here tells that well (0.71 at best), including a cross-encoder. So the label can flag off-topic questions, but it cannot tell when retrieval missed on an in-scope question.

The vocabulary signal was not used: it depends on the synonym maps, which were written from these very questions, and it is weakest for Hindi.

**The rule.** Channel agreement now counts as evidence only when the raw question's vector similarity to some passage is at least 0.825 (`CLOSE_PASSAGE_SIMILARITY` in `retrieval/hybrid.py`). Theme matches and model-chosen themes are unchanged.

The threshold was chosen on the dev split, by a criterion fixed before choosing: the most out-of-scope questions labelled weak, while found questions labelled weak rose by at most one, overall and in each language. Alternatives that did worse on dev:

- requiring closeness for every path: 28 of 35 at 0.81;
- also raising the theme threshold: 31 of 35, but 8 found questions labelled weak;
- vocabulary gates: they cost Hindi most.

The held-out split was then measured once.

| Backend | Split | Out of scope labelled weak | Found labelled weak | Missed labelled weak | Out of scope labelled strong |
| --- | --- | --- | --- | --- | --- |
| In-memory | dev | 24 → **29** of 35 | 5 of 97 → 6 of 98 | 5 of 28 → 5 of 27 | 0 → 0 |
| | test | 8 → **11** of 13 | 2 → 2 of 34 | 6 → 6 of 19 | 1 → 1 |
| PostgreSQL | dev | 24 → **28** of 35 | 5 of 90 → 5 of 91 | 5 of 35 → 5 of 34 | 1 → 1 |
| | test | 9 → **11** of 13 | 2 → 2 of 34 | 6 → 6 of 19 | 1 → 1 |

Before: production on 2026-10-19 code. After: production now. A found or missed count can shift by one because the grief change moved one dev question from missed to found.

- **The original 12 out-of-scope questions:** 6 → 10 labelled weak, on both backends.
- **By language, out of scope labelled weak (in-memory):**
  - English 19 → 25 of 30;
  - Hindi 9 of 9, before and after;
  - Hinglish 4 → 6 of 9.
- **One found question is newly labelled weak:** `friend-owes-money` (dev; vector similarity 0.818).
- **No change on 25 typical Explore searches** ("anger", "Nachiketas", "lamp in a windless place", "krodh", "गुस्सा"…).

What it still gets wrong:

- **Eight out-of-scope questions are still labelled moderate or strong.** Most reach a theme at or just above 0.80:
  - "Explain how photosynthesis works" matches a theme at 0.833 and is labelled strong;
  - "Should my resume be one page or two?";
  - Wi-Fi, gym, Maggi and bike-servicing questions.
- **Some are genuinely close in meaning to the texts.** "How far is the moon from the earth?" and the probe "What time does the sun rise tomorrow?" are close to verses about the moon and the sun.
- **A second stage would catch more, at too high a cost.** Labelling weak any confident result whose best cross-encoder score is below −10 was also chosen on dev. It catches 4 of the 6 remaining dev out-of-scope questions, for one more false weak. Held out, it moves 11 → 12 of 13, with no false weak. But it runs the reranker on about 70% of questions, at about 1.3 s each and 1 GB of memory, so it is not used.
- **Misses on in-scope questions mostly go unflagged** (5 of 27 dev). That would take a signal that separates found from missed, and none of the ones above does.

**Probes outside the question set.** On 2026-10-20, 18 unrelated questions that share words with the texts were run against the rule; none is in the question set, and none was used to set anything:

| Kind | Labelled weak |
| --- | --- |
| Geography: a river through Varanasi, Everest, where the Ganga begins | 3 of 3 |
| Current events: a war, an election, the budget | 3 of 3 |
| Technical: killing a Linux process, learning machine learning | 2 of 3 |
| Other: a solar eclipse, gold as an investment, the battle of Panipat, water on Mars (Hindi), tomorrow's weather (Hinglish) | 5 of 5 |
| Science: light from stars, the speed of light, the heart pumping blood, why the sky is blue | 0 of 4 |

- **Every science probe is labelled moderate.** The Upanishads speak of light, the sun and the heart, so these questions are close in meaning to real verses: vector similarity 0.83–0.88.
- **"How do I free up memory on my phone?"** reaches 2.63 ("from delusion confused memory"), at 0.826, just over the line.

The threshold was not changed for these: they were written knowing how the rule fails, so tuning on them would only fit them. The tests pin the behaviour instead (`tests/test_retrieval.py`):

- 11 probes that sit at least 0.01 below the thresholds must stay weak;
- two science probes are strict expected failures, so a fix will be noticed.

**Retrieval failure is not "out of scope."** Two tests in `tests/test_service.py` cover this, using an in-scope question that retrieval misses ("गीता के अनुसार आत्मा अमर क्यों है?"):

- Without a model, it becomes "limited" evidence, with its passages shown, never `out_of_scope`.
- With a model, weak evidence reaches the answer prompt as a hint (`<retrieval_evidence>`), and only the understanding step can call a question out of scope.

Since the shared lexical index, both backends label all 48 out-of-scope questions alike: 40 weak.

### Conditional reranking

A cross-encoder (`BAAI/bge-reranker-v2-m3`, int8, on CPU) scores the first 30 candidates of production retrieval against each passage's translation, and its order is fused with production's by reciprocal rank.

**What is reachable.**

- Of the 47 in-memory misses, 27 have no expected passage even in the top 30, so no reranker over this pool can recover them. The other 20 are in reach: 12 dev and 8 held out.
- On dev, fusing the reranker's order helped most where retrieval was already confident:
  - strong: MRR +0.080, 2 more found;
  - moderate: MRR −0.012, 2 fewer found;
  - weak: MRR +0.015, 1 more found.

  Cheap uncertainty signals therefore do not point to the questions a reranker would fix.

Both conditions were fixed in advance: rerank when the evidence is weak, or whenever it is not strong. Measured on 2026-10-20, on a 10-core Apple M-series CPU:

| Backend | Reranked | Questions reranked | all hit@5 / hit@8 / MRR | misses | held-out hit@5 / hit@8 / MRR | mean / p95 latency |
| --- | --- | --- | --- | --- | --- | --- |
| In-memory | never (production) | 0% | 0.674 / 0.736 / 0.469 | 47 | 0.566 / 0.642 / 0.321 | 4 / 6 ms |
| | always | 100% | 0.702 / 0.736 / 0.505 | 47 | 0.623 / 0.623 / 0.386 | 1 260 / 1 647 ms |
| | if weak | 26% | 0.680 / 0.742 / 0.474 | 46 | 0.566 / 0.642 / 0.333 | 369 / 1 618 ms |
| | unless strong | 72% | 0.680 / 0.725 / 0.478 | 49 | 0.604 / 0.623 / 0.363 | 1 120 / 1 981 ms |
| PostgreSQL | never (production) | 0% | 0.646 / 0.697 / 0.438 | 54 | 0.585 / 0.642 / 0.315 | 36 / 44 ms |
| | always | 100% | 0.663 / 0.742 / 0.452 | 46 | 0.547 / 0.642 / 0.363 | 1 738 / 2 274 ms |
| | if weak | 25% | 0.657 / 0.708 / 0.440 | 52 | 0.585 / 0.642 / 0.315 | 488 / 2 097 ms |
| | unless strong | 70% | 0.674 / 0.742 / 0.447 | 46 | 0.604 / 0.660 / 0.354 | 1 160 / 1 987 ms |

Notes on the measurement:

- These runs predate the grief change and PostgreSQL's move to BM25: production then had 47 and 54 misses.
- Latency includes retrieving 30 candidates instead of 8.
- PostgreSQL's timings ran beside other low-priority work, so the in-memory figures are the cleaner measure of cost.
- Peak memory of the evaluation process rose from 553 MB to 1.55 GB in memory, and from 752 MB to 1.78 GB with PostgreSQL. The model is 561 MB on disk.

**Decision: not enabled.**

- **Reranking when weak** spends 25–26% of questions, 40 of the 59 of them out of scope, for 1 more found question in memory and 2 with PostgreSQL. None of these are held out.
- **Reranking unless strong** helps PostgreSQL (8 fewer misses; held out, 1 more found), but costs memory 2 found questions.
- **Every variant** adds 1.1–1.7 s to the questions it touches, and about 1 GB of memory on a server that otherwise needs none for this.

Failure modes, if it were enabled:

- the model's first load takes seconds;
- reordering moves the expected passage out of the top 8 for some questions, so held-out hit@8 fell in memory;
- most weak triggers are out-of-scope questions, which reordering cannot help.

**What the PostgreSQL gain was.** PostgreSQL's lexical ranking (`ts_rank_cd`) left relevant passages just below the top 8, and reranking pulled some back. PostgreSQL now ranks with the same BM25 index as the in-memory backend ([above](#the-postgresql-gap)), which closed the gap at no cost: 46 misses on both backends. In memory, reranking every question found no extra passage (47 misses either way), so its PostgreSQL gain is expected to vanish too. That expectation has not been re-measured, and reranking was not revisited in this round.

On 2026-10-19 two other options were tried, and both were worse than production: an English MiniLM cross-encoder (all hit@5 0.399 against 0.579 then), and the bge model's order on its own instead of fused (0.522). `jinaai/jina-reranker-v2-base-multilingual` was not tried: its licence (CC BY-NC 4.0) forbids commercial use.

### Hindi and Hinglish

The slices are small, so every result below is a count:

- **Hindi:** 23 in-scope questions, 16 dev and 7 held out.
- **Hinglish:** 24 in-scope questions, 16 dev and 8 held out.

Held out, Hindi finds 2 of 7 and Hinglish 4 of 8, on both backends:

- Hindi has not changed since the split was created.
- Hinglish rose from 3 to 4 of 8 on 2026-10-19, and did not change on 2026-10-20.

**Why dev questions miss** (10 of 32, in memory):

- **Words the cross-lingual map does not know,** mostly in Hinglish:
  - "samajh nahi aa raha", "bardasht", "daant";
  - English words that Hinglish mixes in but the synonym map lacks: "trust", "cheat", "pressure", "expectations".
- **A wrong sense.** भरोसा (trust, in a person) maps to faith → devotion → worship, so "someone broke my trust" is sent to devotional verses.
- **Core terms missing.** "गीता के अनुसार आत्मा अमर क्यों है?" yields no keywords at all: आत्मा and अमर are not mapped.
- **A stem mismatch.** "grief" does not match Besant's "grievest" or "grieved" (stems *grief* and *griev*), so grief questions missed 2.11.
- **Theme routing.** The expected theme was matched for 12 of 32 questions. The embedding model handles romanized Hindi poorly; on its own, the vector channel finds nothing for Hinglish.

Inflected forms and spelling variants did not appear among the misses, so no Hindi stemmer or Hinglish spelling normaliser was built.

**Two mechanisms were tested,** chosen on dev and then measured once held out (`experiments language`, in-memory):

| Mechanism | Hindi dev | Hinglish dev | Hindi held out | Hinglish held out | English |
| --- | --- | --- | --- | --- | --- |
| Production, before this change | 13 of 16, MRR 0.667 | 9 of 16, MRR 0.261 | 2 of 7 | 4 of 8 | |
| "grieve" added where "grief" is a target | 13 of 16, unchanged | **10 of 16**, MRR 0.292; 1 better, none worse | 2 of 7 | 4 of 8 | unchanged |
| Themes also matched on an English gloss of the mapped words | 14 of 16, MRR 0.632; 3 better, 3 worse | 9 of 16, MRR 0.321; 3 better, 2 worse | 3 of 7 | 5 of 8 | unchanged |

- **"grieve" was adopted.** It corrects the map's pointer to the translation's own wording. It is a general fix, not a language rule: one dev question gained, none held out.
- **The gloss was not adopted.** It was mixed on dev, where decisions are made. Its held-out gain (one question in each language) is reported, but it was not used to decide, so it is untested. Measure it first on independent questions.
- **No words were added to the cross-lingual map.** The same person wrote the dev and the held-out Hindi and Hinglish questions, so a list written now could carry knowledge of the held-out wording, and this set could not reveal it. Vocabulary for Hindi and Hinglish is the clearest case for [independent questions](INDEPENDENT_EVALUATION.md).
- **The rejected Hinglish→Devanagari rendering stays out of production** ([below](#experiments-not-adopted)).

**Root causes of every miss** (`experiments language-misses`). For each Hindi or Hinglish question still missed, it reports:

- which content words the cross-lingual map translates, and which it leaves out;
- the English words mixed in;
- near-spellings of known Hinglish words;
- the keywords produced;
- where the expected passages rank in the lexical and vector lists;
- whether their themes were matched;
- whether the expected passages share any word with the keywords.

Each miss is classified by its main cause. The dev misses were classified first, and the decision below was made on them alone. The held-out misses were classified afterwards, for the record.

| Main cause | Dev (9 misses) | Held out (9 misses) |
| --- | --- | --- |
| **Vocabulary gap:** content words neither map knows | 5: `hl-breakup` ("breakup", "move on", "profile"), `hl-parents-career` ("samajh nahi aa raha"), `hi-k-immortal-self` (आत्मा, अमर: no keywords at all), `hl-cheated` ("cheat", "trust"), `hl-expectations` ("pressure", "bardasht") | 9: पिताजी, बीमार, खोने; बोर्ड, अंक, नाराज़; मोबाइल, लत; शादी, दबाव; कृष्ण, अर्जुन, युद्ध; "kisi kaam ka nahi"; "reels", "scroll"; "company", "smart"; "nahi rahe", "sambhal" |
| **Wrong sense:** a mapped word points to the wrong idea | 2: `hi-broken-trust` (भरोसा → faith, devotion), `hl-boss-scolds` ("boss" → leadership verses) | 0 |
| **Mapped words are not the expected verses' words**, and themes miss | 2: `hi-lose-courage`, `hl-trust-god` | 0 |
| **Transliteration:** a spelling variant of a known word | 0 | 0 |

Two observations hold across all 18 misses:

- The expected passages share almost no word with the keywords the question produced.
- The vector channel never ranks an expected passage in the top 8, and the expected theme was matched once, in dev.

The lexical channel finds the expected passage just outside the top 8 for a few: rank 9 for `hl-breakup`, 13 for `hl-expectations`, 14 for `hi-lose-courage`. So ranking is not the bottleneck: the words never reach a passage that speaks to the question.

**Decision: no production change for Hindi or Hinglish.** Every fix the misses suggest is a word list or a sense rule written from these questions:

- English words mixed into Hinglish;
- Hindi life vocabulary;
- a context rule for भरोसा.

Two things rule that out. The spec forbids adding synonyms merely because they fix questions already seen, and the same person wrote both splits. No new mechanism emerged that could be tested independently of this question set.

Candidates to test once independent questions are frozen, chosen on dev first:

1. **The texts' own names and core terms** in Devanagari and romanized Hindi (कृष्ण, अर्जुन, आत्मा, कर्म, धर्म, योग), taken from the corpus and the theme index rather than from the questions. There is one Hindi knowledge question in each split, too few to judge here.
2. **The English-gloss theme matching** above.
3. **The hyphenated-parts fix** ([above](#the-postgresql-gap)).

### Leakage

`python -m app.evaluation.independent leakage`, enforced by a test, lists two things: vocabulary-map words that only held-out questions use, and five-word phrases copied from held-out questions into the maps, the prompts or the theme index. On 2026-10-20 it found:

- **14 words**, all in the maps since 2026-10-13, before the held-out questions were written on 2026-10-19.
- **"binge"**, added on 2026-10-19 and used only by `stress-eating`. It was removed; that question's result did not change.
- **One phrase.** `k-mind-like-wind` asks for 6.34 in words that a theme summary has used since 2026-10-13.

The details, and what the audit cannot catch, are in [INDEPENDENT_EVALUATION.md](INDEPENDENT_EVALUATION.md#6-leakage-guards).

### Experiments not adopted

Each was measured on the same questions and candidates as production retrieval, with `app/evaluation/experiments.py`.

**Hinglish in Devanagari** (`experiments hinglish`). `app/retrieval/hinglish.py` detects romanized Hindi (two or more unambiguous Hindi function words). It renders the Hindi words in Devanagari from a lexicon of about 400 common words, and keeps English words as typed; it never touches English, Devanagari or romanized Sanskrit lookups.

- Searching with the rendering instead of the question, beside it, or also for theme matching all lowered Hinglish hit@8 (0.458 → 0.333–0.375). English and Hindi were unchanged.
- It helped three dev questions, the ones looked at while building the lexicon, and hurt mostly held-out ones.
- A rule-based transliteration of unknown words (ITRANS with Hindi spelling) did no better.

It is not used in production; the module and its tests are kept for the record.

**Semantic theme routing** (`experiments themes`). Only 27% of the themes matched for English questions were among the labelled ones, and 12% for Hinglish. Yet nothing did better than production on dev:

- a higher similarity threshold (0.82 or 0.84);
- at most 1 or 2 themes;
- a margin to the best theme;
- half weight;
- turning semantic themes off.

Wrong themes cost less than right ones gain, and the labels are not exhaustive.

### Ablations

In-memory backend, without the model, current settings, hit@8 / MRR:

| Channels | All | English | Hindi | Hinglish |
| --- | --- | --- | --- | --- |
| vector only | 0.320 / 0.196 | 0.412 / 0.262 | 0.130 / 0.024 | 0.000 / 0.000 |
| lexical only | 0.607 / 0.425 | 0.656 / 0.448 | 0.522 / 0.420 | 0.417 / 0.305 |
| concept only | 0.472 / 0.282 | 0.504 / 0.303 | 0.435 / 0.221 | 0.333 / 0.225 |
| lexical + concept + roman | 0.730 / 0.440 | 0.771 / 0.460 | 0.652 / 0.482 | 0.583 / 0.293 |
| all (default) | 0.742 / 0.472 | 0.786 / 0.504 | 0.652 / 0.489 | 0.583 / 0.285 |

- **Semantic search on the raw question is weak on its own, and useless for Hinglish.** People ask in modern language, and Besant's translation speaks of "fruits of action" and "the pairs of opposites". The lexical channel bridges the gap with a synonym map and a Hindi/Hinglish keyword map, and the concept channel does so through the theme descriptions.
- **The vector channel helps with the current settings.** All channels together beat lexical + concept + roman (0.742 / 0.472 against 0.730 / 0.440).
- **Hinglish is still the weakest language.** See [Hindi and Hinglish](#hindi-and-hinglish). With a model configured, the understanding step rewrites the question in English, which this table does not exercise.

### Caveats: why these numbers are likely optimistic

1. **The questions, the labels and the theme index have the same authors.** All were written during this project's development, with AI assistance: the held-out questions and the 2026-10-20 out-of-scope questions too. A passage also counts as relevant when it belongs to a listed theme, so the concept channel retrieves exactly what the metric rewards. An [independent set](INDEPENDENT_EVALUATION.md) is still the most valuable next step.
2. **The held-out split has been looked at several times.** It was used for the fusion setting on 2026-10-19, and on 2026-10-20 for the evidence rule, the language mechanisms, reranking and PostgreSQL's lexical ranking. Its Hindi and Hinglish misses have also been read, after decisions were made. Each choice was made on dev before its single held-out measurement. Still, repeated looks wear a held-out set down, and its author also tunes the system. Treat it as a check, not an independent estimate.
3. **Some slices are small.** The held-out split has 7 Hindi and 8 Hinglish in-scope questions and 13 out of scope; one question moves their rates by 8–14 points.
4. **The labels are not exhaustive.** Precision is a lower bound, a different relevant verse in the top 8 counts as a miss, and "missed labelled weak" is a noisy target.
5. **Retrieval quality is not answer quality.** The model chooses which retrieved passages to use, and can say that none fit.

## Embedding model study

This study ran on the Gita-only corpus of 701 verses, with the evaluation set as it stood then, using vector search alone. It measured whether to use a multilingual model, and whether to append the theme names to each passage before embedding (`EMBEDDING_WITH_THEMES`). Figures are hit@8 / MRR.

| Model | Embedded text | English | Hindi | Hinglish |
| --- | --- | --- | --- | --- |
| `intfloat/multilingual-e5-small` | translation | 0.38 / 0.23 | 0.12 / 0.02 | 0.00 / 0.00 |
| | + theme names | 0.28 / 0.19 | 0.00 / 0.00 | 0.00 / 0.00 |
| `BAAI/bge-small-en-v1.5` | translation | 0.45 / 0.25 | 0.00 / 0.00 | 0.25 / 0.08 |
| | + theme names | 0.60 / 0.36 | 0.38 / 0.08 | 0.75 / 0.20 |
| `paraphrase-multilingual-MiniLM-L12-v2` | translation | 0.30 / 0.12 | 0.38 / 0.19 | 0.00 / 0.00 |
| | + theme names | 0.30 / 0.14 | 0.62 / 0.33 | 0.00 / 0.00 |
| `nomic-embed-text-v1.5` (quantized) | translation | 0.38 / 0.22 | 0.00 / 0.00 | 0.12 / 0.04 |
| | + theme names | 0.57 / 0.36 | 0.00 / 0.00 | 0.25 / 0.10 |
| `snowflake-arctic-embed-s` | + theme names | 0.38 / 0.19 | 0.25 / 0.14 | 0.25 / 0.17 |

Theme routing matches the question against the theme descriptions, and it carries most of the retrieval quality. The table shows how often the best expected theme ranked first, in the top 3 and in the top 5:

| Model | top-1 | top-3 | top-5 | top-3 English | top-3 Hindi | top-3 Hinglish |
| --- | --- | --- | --- | --- | --- | --- |
| `multilingual-e5-small` | 0.48 | 0.72 | 0.83 | 0.74 | 0.88 | 0.50 |
| `bge-small-en-v1.5` | 0.33 | 0.61 | 0.70 | 0.74 | 0.12 | 0.50 |
| `paraphrase-multilingual-MiniLM-L12-v2` | 0.50 | 0.70 | 0.80 | 0.74 | 0.75 | 0.50 |

**Decision.** The default is `multilingual-e5-small` with plain passages. It routes Hindi questions to the right theme far better (0.88 against 0.12 for bge), and the lexical channel compensates for its weaker English vector search.

Appending theme names helps English-only models on this set, but it carries the labelling bias above into the vector channel, so it is off by default.

**Thresholds are specific to the model.**

- For e5, the best theme similarity is compressed into a narrow band:
  - in-scope questions: minimum 0.780, median 0.818;
  - out-of-scope questions: 0.733–0.798.
- The concept-match threshold (0.80) and the "strong" threshold (0.83) were set on that distribution.
- bge's in-scope median is 0.577, so the thresholds do not transfer.

If you change `EMBEDDING_MODEL`, re-derive `CONCEPT_MATCH_MIN` and `STRONG_CONCEPT_SIMILARITY` in `retrieval/hybrid.py` with `make eval`.

## Answers

```bash
cd backend
.venv/bin/python -m app.evaluation.answers              # 16 sampled cases
.venv/bin/python -m app.evaluation.answers --all --json answers.json
```

The harness runs the full pipeline (understand → retrieve → generate → verify) on evaluation questions and on three safety cases: a crisis message in English, one in Hindi, and a request to use Krishna's words to justify beating someone up. It scores each answer automatically:

| Check | Meaning |
| --- | --- |
| `completed` | The pipeline produced an answer, not a fallback |
| `kind_ok` | Guidance for life questions, out-of-scope or insufficient-sources for unrelated ones, crisis for crisis messages |
| `citation_relevance` | Share of cited passages that are relevant to the case |
| `invented_citations` | Citations of passages that were not provided. The verifier removes them; any nonzero value shows the model tried. |
| `quote_fixes` | Quotation marks the verifier removed from wording not found in the sources |
| `language_ok` | The reply is in the language of the question |

These checks measure grounding and behaviour, not wisdom. Read a sample of the answers as well, especially the "limits" fields and the safety cases.

### Results so far

**Claude has not been evaluated.** No API key was available during development. The only end-to-end run used `deepseek-r1:1.5b` through Ollama on 6 cases:

| Check | Result |
| --- | --- |
| `kind_ok` | 0.5 |
| `citation_relevance` | 0.0 |
| `invented_citations` | 0 |
| `quote_fixes` | 0 |
| `language_ok` | 1.0 |

The grounding machinery held: schema-valid output, no citation outside the retrieved set, and the language reconciled correctly. But a 1.5B model cannot do the task, which confirms that a capable model is required.

Each case makes two model calls. Run `--all` once a key is configured, and record the results here. It now covers 226 questions and the 3 safety cases, about 460 model calls.

On 2026-10-20 the answer evaluation was skipped, because no model key was configured.

## Automated tests

| Suite | Count | Covers |
| --- | --- | --- |
| Backend, `make test` | 132: 130 pass, and 2 are strict expected failures that document known false confidence. The cross-backend check needs a running database holding the current corpus, and skips without one. | See below |
| Browser, `make e2e` | 274: 137 each on desktop Chrome and a Pixel 7. 247 run: 135 on desktop and 112 on the Pixel 7. The 27 skipped are by design: 22 set their own viewports and run on desktop only, 3 run on one device only (desktop navigation, the mobile menu, and a follow-up on a phone), and the chapter rail and step list exist on large screens only. | See below |

The backend tests cover:

- Sanskrit normalisation and transliteration;
- corpus parsing and validation, including fabricated quotes, unattested terms, stale transliterations and edition coverage;
- editorial reviews;
- retrieval, including Hindi, Hinglish and romanized Sanskrit;
- lexical ranking: rare words outweigh common ones, length is normalised, notes and themes count less, the PostgreSQL index rebuilds after a reload, and both backends return identical results;
- the evidence label: words shared with the texts are not evidence on their own; unrelated geographic, current-events and technical questions stay weak; known failures on science questions are pinned; and a retrieval miss on an in-scope question is "limited" evidence, never "out of scope";
- stories:
  - every excerpt comes from the story's own text;
  - every verse a story cites, and every quotation in it, is among the passages shown with it;
  - a missing passage, a story without excerpts, or an excerpt from another text fails validation;
  - every excerpt carries its translator and source link;
- the independent question set:
  - validation of every field;
  - refusal of malformed files and damaged freeze records;
  - all-or-nothing imports;
  - the whole workflow on synthetic fixtures (import, labelling sheet, two labellers, resolving, adjudicating, freezing, refusal to report fixtures as independent, evaluation, tamper detection);
  - 95% intervals;
  - the leakage audit of held-out questions;
- crisis detection in three languages and the verifier;
- the answer pipeline with a fake model: grounding, follow-ups, model failures, missing credentials and language handling;
- the HTTP API: errors, malformed requests, rate limits and feedback consent.

The browser tests cover:

- the ask flow and saving a reflection;
- the Ask page's two views:
  - the invitation shows nothing from earlier, and offers an earlier conversation without showing it;
  - the logo, Ask in the navigation, back, forward, refresh and "New question" move between the views without
    losing the conversation;
  - the logo brings back the invitation from another page too, though Next.js keeps the Ask page and its state
    while that page is open;
  - progress while an answer is prepared, and "Stop" returning the question to its box;
  - an error keeping the question, with "Try again", and a double press sending the question once;
  - a real answer read as one column under a quiet note, its passages leading to their verse pages and back;
  - the answer surviving a theme change, and a follow-up sent from the keyboard;
  - the answer fitting six screen sizes, with the instrument beside or above the reading, never over it;
- the crisis flow;
- search;
- chapter, verse, Upanishad, theme and story pages;
- every story: its excerpts and their sources, its references opening the verses they name, and the editors' reading kept apart from the source text;
- that citations open the right scan;
- real 404s;
- axe WCAG 2.1 AA checks on 12 pages, in both the light and the dark theme;
- no horizontal scrolling at phone width, and none on key pages at small-phone, tablet and ultrawide sizes, or in a full answer at 360 to 1280 px;
- the Ask screen at seven sizes from 360 × 740 to 2560 × 1080: the question box and its button sit in the first screen, clear of the header;
- the landing story:
  - its five chapters, in order;
  - the chapter rail marks where you are and takes you to a chapter;
  - its passages match the corpus exactly (text, reference, citation and links);
  - the theme explorer works by pointer and keyboard, and its links lead to real pages;
  - the step in view is marked in the understanding chapter;
  - the last chapter returns you to the question box;
  - content moves into place with the scroll, and holds still for reduced motion;
- the 3D scene:
  - it loads after the page;
  - it follows the landing story as the page scrolls, and the conversation (thinking, reading);
  - it draws nothing in a background tab;
  - a still drawing stands in without WebGL, and asking still works;
  - frames are identical under reduced motion, and the still instrument stays faint behind the middle chapters;
  - pages meant for reading have no scene;
  - it fades out for a crisis reply;
- Sanskrit typesetting: a half-verse mark never wraps onto a line of its own;
- keyboard access;
- the appearance setting: System by default, live device changes, explicit Light and Dark that persist,
  returning to System, a choice made in another tab, the theme applied before the first paint, and no
  hydration errors;
- desktop and mobile navigation, and follow-up questions carrying the conversation so far;
- deleting saved reflections, one at a time or all at once, with confirmation;
- no console errors or warnings on key pages, in either theme;
- the BODH identity: page titles, the header and the footer, each page's link preview, the icons and the
  preview image, the name in Devanagari marked as Hindi, and the mark's bead that travels while an answer is
  prepared and holds still with reduced motion.

None of them needs a model: the backend tests use a fake one, and the browser tests pass with or without a key. With a key configured, the ask test makes real model calls.
