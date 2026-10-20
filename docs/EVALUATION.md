# Evaluation

This document covers two evaluations and the automated tests:

- **Retrieval:** does the app find passages that address the question? It needs no model and runs in seconds.
- **Answers:** does the full pipeline produce grounded, well-behaved guidance? It needs a configured model and makes real model calls.

Retrieval figures were measured on 2026-10-19, the others on 2026-10-10, against the current corpus of 872 passages, unless a section says otherwise.

## Retrieval

```bash
make eval                                                              # memory backend, all 190 questions
cd backend && .venv/bin/python -m app.evaluation.retrieval --split test    # only the held-out questions
.venv/bin/python -m app.evaluation.retrieval --backend postgres
.venv/bin/python -m app.evaluation.retrieval --channels lexical,concept    # ablation
.venv/bin/python -m app.evaluation.retrieval --with-llm                    # include the model's query rewriting
.venv/bin/python -m app.evaluation.experiments themes|hinglish|rerank      # the experiments below
```

Run them from `backend/` (or through `make`): the `app` package lives there, so `python -m app...` from the repository root fails with `ModuleNotFoundError: No module named 'app'`.

### The question set

`backend/app/evaluation/dataset.yaml` has 190 questions, 178 in scope and 12 out of scope. The first 74 were written earlier; 116 were added on 2026-10-19.

| | English | Hindi (Devanagari) | Hinglish (romanized) | All |
| --- | --- | --- | --- | --- |
| Life situations | 95 | 21 | 23 | 139 |
| Knowledge about the texts | 32 | 2 | 1 | 35 |
| Verse lookups by their words | 4 | | | 4 |
| Out of scope | 10 | 1 | 1 | 12 |
| **All** | **141** | **24** | **25** | **190** |

Life situations cover career and study pressure, family, relationships, grief, anger, habits, decisions, purpose and spirituality; knowledge questions ask about the Gita, the Katha, Isha and Kena Upanishads, and their imagery and episodes.

Each in-scope question lists:

- `expected`: verses that clearly address it. Every one was read against its question in the corpus before it was listed. The list is not exhaustive.
- `concepts`: the editorial themes that fit it.

A retrieved passage counts as relevant if it is in `expected` or belongs to one of the listed themes.

**Held-out split.** 57 of the added questions carry `split: test` (41 English, 8 Hindi, 8 Hinglish). They are held out: settings are chosen on the other 133 (`dev`), and the test split is only reported. The original 74 are all dev, because earlier settings were tuned on them.

**Corrections.** One label was corrected, with the reason beside it in the file: `k-food` now also expects 17.7, where Krishna introduces the three kinds of food.

### Metrics

Over in-scope questions, k = 8 (the number of passages an answer is built from):

| Metric | Meaning |
| --- | --- |
| **hit@5**, **hit@8** | Share of questions with at least one expected verse in the top 5 or top 8 |
| **MRR** | Mean reciprocal rank of the first expected verse |
| **misses** | Questions with no expected verse in the top 8 |
| **precision@8** | Share of the top 8 that is relevant. Unlabelled relevant verses count as misses, so this is a lower bound. |
| **concept recall** | Share of the expected themes that retrieval matched |
| **evidence** | How `assess_evidence` labelled each result: strong, moderate or weak |
| **latency** | Median and 95th-percentile retrieval time, embedding of the question included |

The report breaks every metric down by split, language, question type and category.

### Results without the model

The raw question only, as in the no-key mode. With a model, the understanding step adds rewritten queries and chosen themes; that path has not been measured with a capable model yet. Measured on 2026-10-19.

| Backend | Split | hit@5 | hit@8 | MRR | precision@8 | misses | p50 / p95 latency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL (default) | all | 0.646 | 0.697 | 0.438 | 0.275 | 54 | 23 / 27 ms |
| | test | 0.585 | 0.642 | 0.315 | 0.229 | | |
| In-memory | all | 0.674 | 0.736 | 0.469 | 0.282 | 47 | 3 / 6 ms |
| | test | 0.566 | 0.642 | 0.321 | 0.238 | | |

By language, hit@5 / hit@8 / MRR, before the changes below and after:

| Language | n | In-memory before | In-memory after | PostgreSQL before | PostgreSQL after |
| --- | --- | --- | --- | --- | --- |
| English | 131 | 0.618 / 0.718 / 0.460 | 0.725 / 0.786 / 0.504 | 0.641 / 0.695 / 0.454 | 0.672 / 0.733 / 0.478 |
| Hindi | 23 | 0.609 / 0.609 / 0.373 | 0.652 / 0.652 / 0.489 | 0.609 / 0.609 / 0.326 | 0.652 / 0.652 / 0.417 |
| Hinglish | 24 | 0.333 / 0.458 / 0.200 | 0.417 / 0.542 / 0.264 | 0.292 / 0.458 / 0.179 | 0.500 / 0.542 / 0.234 |

These mix dev and held-out questions. On the held-out questions alone (in-memory), English hit@8 rose from 0.658 to 0.737 (n = 38) and Hinglish from 3 to 4 of 8, while Hindi stayed at 2 of 7: its gain above is on dev questions only.

By type (in-memory): life situations 0.647 / 0.705 / 0.448, knowledge 0.743 / 0.829 / 0.534, lookups 1.000 / 1.000 / 0.646.

The backends differ only in lexical ranking: PostgreSQL full-text search against BM25.

### What changed on 2026-10-19, and what each change did

The baseline is production retrieval on the 190-question set before any change. On it, the earlier figures (hit@5 0.686 on 74 questions) turned out to be optimistic: the new held-out questions scored much lower than the questions the settings had been tuned on.

| Step (cumulative; in-memory) | dev hit@5 | test hit@5 | test hit@8 | test MRR | misses |
| --- | --- | --- | --- | --- | --- |
| Baseline | 0.624 | 0.472 | 0.566 | 0.314 | 59 |
| 1. Synonyms also found for other forms of a word ("cravings", "grudges") | 0.632 | 0.472 | 0.566 | 0.309 | 58 |
| 2. A few more words mapped to the translation's vocabulary ("charity" → alms, gift; "bright" → splendour; quarrel, smoking and drinking; तुलना, झगड़ा) | 0.656 | 0.491 | 0.585 | 0.315 | 53 |
| Label correction (`k-food`, above) | 0.664 | 0.491 | 0.585 | 0.315 | 52 |
| 3. Fusion: raw-question vector weight 0.5 → 0.25, `RRF_K` 60 → 30 | 0.720 | 0.566 | 0.642 | 0.321 | 47 |

On PostgreSQL the same changes take all-question hit@5 from 0.590 to 0.646, MRR from 0.400 to 0.438, misses from 62 to 54, and test hit@5 from 0.547 to 0.585.

Steps 2 and 3 were chosen by looking at dev questions, so the dev gains are optimistic; the test columns are the honest measure. Step 3 was the best of a 12-setting grid on dev; on test it improved 9 questions and worsened 3.

**Evidence labels moved in the safer direction.** Questions labelled moderate or strong although no expected verse was retrieved fell from 54 to 43 on PostgreSQL (51 to 36 in memory); questions labelled weak although an expected verse was retrieved rose from 4 to 7 (3 to 7). Out-of-scope questions are unchanged: 6 of the 12 are labelled weak, and 5 moderate and 1 strong. Unrelated questions often share words or meaning with the battle and victory verses ("Who won the cricket world cup?"), and theme similarities of unrelated and related questions overlap (0.73–0.80 against 0.78 and up). With a model, the understanding step decides `out_of_scope` itself; in no-key mode the label is a hint, not a classifier.

### Experiments not adopted

Each was measured on the same questions and candidates as production retrieval, with `app/evaluation/experiments.py`.

**Hinglish in Devanagari** (`experiments hinglish`). `app/retrieval/hinglish.py` detects romanized Hindi (two or more unambiguous Hindi function words) and renders its Hindi words in Devanagari from a lexicon of about 400 common words, keeping English words as typed; it never touches English, Devanagari or romanized Sanskrit lookups. Searching with the rendering instead of the question, beside it, or also for theme matching all lowered Hinglish hit@8 (0.458 → 0.333–0.375), with English and Hindi unchanged. It helped three dev questions, the ones looked at while building the lexicon, and hurt mostly held-out ones. A rule-based transliteration of unknown words (ITRANS with Hindi spelling) did no better. Not used in production; the module and its tests are kept for the record.

**Semantic theme routing** (`experiments themes`). Only 27% of the themes matched for English questions (12% for Hinglish) were among the labelled ones. Yet no stricter setting (similarity 0.82 or 0.84, at most 1 or 2 themes, a margin to the best theme, half weight) or turning semantic themes off did better than production on dev: wrong themes cost less than right ones gain, and the labels are not exhaustive.

**Cross-encoder reranking** (`experiments rerank`), on the first 30 (or 15) candidates of production retrieval, scored against each passage's translation:

| Reranker (all on CPU, Apple M-series, 10 cores) | Mode | all hit@5 | test hit@5 | test hit@8 | test MRR | ms per question |
| --- | --- | --- | --- | --- | --- | --- |
| none (production) | | 0.674 | 0.566 | 0.642 | 0.321 | 3 |
| `Xenova/ms-marco-MiniLM-L-6-v2` (80 MB, English) | rerank | 0.399* | 0.377* | 0.453* | 0.250* | 77 |
| | fuse | 0.511* | 0.434* | 0.566* | 0.335* | 77 |
| `BAAI/bge-reranker-v2-m3` int8 (570 MB, multilingual) | rerank | 0.522* | 0.509* | 0.566* | 0.321* | 1 204 |
| | fuse | 0.702 | 0.623 | 0.623 | 0.386 | 1 232 |
| | fuse, 15 candidates | 0.685 | 0.566 | 0.623 | 0.393 | 677 |

\* Measured before steps 1–3, against that baseline (all hit@5 0.579, test 0.472 / 0.566 / 0.314).

"rerank" orders the candidates by the model alone; "fuse" combines its order with production's by reciprocal rank. The multilingual model in fuse mode ranks better (all MRR 0.469 → 0.505; test MRR 0.321 → 0.386) but does not find more: all hit@8 is unchanged at 0.736 (0.742 with 15 candidates), test hit@8 falls from 0.642 to 0.623, and Hinglish hit@8 from 0.542 to 0.500. It costs 0.7–1.2 s per question and 1.4 GB of memory, against 3–25 ms today. Not integrated; a GPU, or reranking only when evidence is weak, would be the next things to try. `jinaai/jina-reranker-v2-base-multilingual` was not tried: its licence (CC BY-NC 4.0) forbids commercial use.

### Ablations

In-memory backend, without the model, current settings, hit@8 / MRR:

| Channels | All | English | Hindi | Hinglish |
| --- | --- | --- | --- | --- |
| vector only | 0.320 / 0.196 | 0.412 / 0.262 | 0.130 / 0.024 | 0.000 / 0.000 |
| lexical only | 0.596 / 0.419 | 0.649 / 0.447 | 0.522 / 0.420 | 0.375 / 0.263 |
| concept only | 0.472 / 0.282 | 0.504 / 0.303 | 0.435 / 0.221 | 0.333 / 0.225 |
| lexical + concept + roman | 0.725 / 0.438 | 0.771 / 0.460 | 0.652 / 0.482 | 0.542 / 0.272 |
| all (default) | 0.736 / 0.469 | 0.786 / 0.504 | 0.652 / 0.489 | 0.542 / 0.264 |

- **Semantic search on the raw question is weak on its own**, and useless for Hinglish: people ask in modern language, and Besant's translation speaks of "fruits of action" and "the pairs of opposites". The lexical channel bridges the gap with a synonym map and a Hindi/Hinglish keyword map, and the concept channel through the theme descriptions.
- **With the current settings the vector channel helps**: all channels together beat lexical + concept + roman (0.736 / 0.469 against 0.725 / 0.438). On the earlier 74-question set it did not.
- **Hinglish is still the weakest language.** Romanized Hindi has no stemmer and the embedding model handles it poorly. Extending `CROSS_LINGUAL` with more words helped where it applied; the Devanagari rendering did not (above). With a model configured, the understanding step rewrites the question in English, which this table does not exercise.

### Caveats: why these numbers are likely optimistic

1. **The labels and the theme index have the same authors.** The questions, their expected passages and the editorial theme index were all written during this project's development, with AI assistance, and the held-out questions too. A passage also counts as relevant when it belongs to a listed theme, so the concept channel retrieves exactly what the metric rewards. An independent set, written by people who have not seen the theme index, is still the most valuable next step.
2. **The set is still small for some slices.** The held-out split has 8 Hindi and 8 Hinglish questions; one question moves their hit rates by 12.5 points.
3. **The labels are not exhaustive.** Precision is a lower bound, and a different relevant verse in the top 8 counts as a miss.
4. **Retrieval quality is not answer quality.** The model chooses which retrieved passages to use, and can say that none fit.

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

Each case makes two model calls. Run `--all` once a key is configured, and record the results here.

## Automated tests

| Suite | Count | Covers |
| --- | --- | --- |
| Backend, `make test` | 76 | See below |
| Browser, `make e2e` | 208: 104 each on desktop Chrome and a Pixel 7. 192 run: 103 on desktop and 89 on the Pixel 7. The 16 skipped are by design: 12 set their own viewports and run on desktop only, 2 navigation tests each run on one device, and the chapter rail and step list exist on large screens only. | See below |

The backend tests cover:

- Sanskrit normalisation and transliteration;
- corpus parsing and validation, including fabricated quotes, unattested terms, stale transliterations and edition coverage;
- editorial reviews;
- retrieval, including Hindi, Hinglish and romanized Sanskrit;
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
