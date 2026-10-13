# Evaluation

This document covers two evaluations and the automated tests:

- **Retrieval:** does the app find passages that address the question? It needs no model and runs in seconds.
- **Answers:** does the full pipeline produce grounded, well-behaved guidance? It needs a configured model and makes real model calls.

All numbers below were measured on 2026-10-10 against the current corpus of 872 passages, unless a section says otherwise.

## Retrieval

```bash
make eval                                                        # memory backend
cd backend && .venv/bin/python -m app.evaluation.retrieval --backend postgres
.venv/bin/python -m app.evaluation.retrieval --channels lexical,concept   # ablation
.venv/bin/python -m app.evaluation.retrieval --with-llm          # include the model's query rewriting
```

### The question set

`backend/app/evaluation/dataset.yaml` has 74 questions:

| Group | Questions | Notes |
| --- | --- | --- |
| Life situations, English | 37 | Career, study, family, anger, grief, comparison, habits, ethics and more, including 2 that target the Katha Upanishad |
| Knowledge and lookup, English | 17 | "What does Krishna say about the kinds of food people prefer?", a half-remembered romanized verse, a Devanagari line, and 2 questions about the Katha Upanishad |
| Hindi (Devanagari) | 8 | Life situations |
| Hinglish (romanized) | 8 | Life situations |
| Out of scope | 4 | A coding question, stocks, a recipe, a capital city |

Each in-scope question lists:

- `expected`: verses that clearly address it. The list is not exhaustive.
- `concepts`: the editorial themes that fit it.

A retrieved passage counts as relevant if it is in `expected` or belongs to one of the listed themes.

### Metrics

Over the 70 in-scope questions, k = 8 (the number of passages an answer is built from):

| Metric | Meaning |
| --- | --- |
| **hit@5**, **hit@8** | Share of questions with at least one relevant passage in the top 5 or top 8 |
| **MRR** | Mean reciprocal rank of the first relevant passage |
| **precision@8** | Share of the top 8 that is relevant. Unlabelled relevant verses count as misses, so this is a lower bound. |
| **concept recall** | Share of the expected themes that retrieval matched |
| **evidence** | How `assess_evidence` labelled each result: strong, moderate or weak |
| **latency** | Median retrieval time, embedding of the question included |

### Results without the model

This is the raw question only, as in the no-key mode. With a model, the understanding step adds rewritten queries and chosen themes; that path has not been measured with a capable model yet.

| Backend | hit@5 | hit@8 | MRR | precision@8 | p50 latency |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL (default) | 0.686 | 0.743 | 0.497 | 0.302 | 23 ms |
| In-memory | 0.686 | 0.757 | 0.522 | 0.307 | 3 ms |

By language, PostgreSQL first and in-memory in brackets:

| Language | n | hit@8 | MRR |
| --- | --- | --- | --- |
| English | 54 | 0.722 (0.741) | 0.528 (0.536) |
| Hindi | 8 | 1.000 (1.000) | 0.490 (0.667) |
| Hinglish | 8 | 0.625 (0.625) | 0.292 (0.283) |

The backends differ only in lexical ranking: PostgreSQL full-text search against BM25.

**Evidence labels.**

- In-scope questions: PostgreSQL labelled them 26 strong, 40 moderate and 4 weak.
- Out-of-scope questions:
  - In memory, all 4 are weak.
  - On PostgreSQL, 3 are weak and the recipe question is moderate. "Paneer butter masala" shares "butter" with the offering verses (9.16), and both the lexical and the vector channel rank that verse, so the agreement counts as evidence.

With a model configured, the understanding step decides `out_of_scope` itself and the evidence label does not gate it. In no-key mode, such a question gets passages labelled "moderate". The evidence heuristic is a hint, not a classifier.

### Ablations

In-memory backend, without the model, hit@8 / MRR:

| Channels | All | English | Hindi | Hinglish |
| --- | --- | --- | --- | --- |
| vector only | 0.343 / 0.194 | 0.407 / 0.247 | 0.250 / 0.031 | 0.000 / 0.000 |
| lexical only | 0.671 / 0.540 | 0.630 / 0.503 | 0.875 / 0.750 | 0.750 / 0.580 |
| concept only | 0.529 / 0.339 | 0.519 / 0.361 | 0.750 / 0.385 | 0.375 / 0.150 |
| lexical + concept + roman | 0.771 / 0.539 | 0.759 / 0.529 | 1.000 / 0.854 | 0.625 / 0.292 |
| all (default) | 0.757 / 0.522 | 0.741 / 0.536 | 1.000 / 0.667 | 0.625 / 0.283 |

What the ablations show:

- **Semantic search on the raw question is weak on its own.** People ask in modern language about exams and offers; Besant's translation speaks of "fruits of action" and "the pairs of opposites". The lexical channel bridges this gap with a synonym map and a Hindi/Hinglish keyword map, and the concept channel bridges it through the theme descriptions.
- **Dropping the passage-vector channel scores slightly higher on this set:** 0.771 against 0.757, a single question. The channel is kept for two reasons:
  - It is the only one that can match a paraphrase sharing no words with either the translation or the theme index. The question set favours the other channels (see the caveats below).
  - The model's rewritten queries are searched semantically at full weight, a path this table does not exercise.

  Its weight on the raw question was already halved to 0.5 after earlier ablations. Re-measure with `--with-llm` once a key is configured. If the channel still does not help, set `RETRIEVAL_RAW_VECTOR_WEIGHT=0`.
- **Hinglish is the weakest language.** Romanized Hindi has no stemmer, the embedding model handles it poorly, and the keyword map covers only common words. Extending `CROSS_LINGUAL` in `retrieval/text.py` and adding Hinglish cases is the cheapest improvement.

### Caveats: why these numbers are likely optimistic

1. **The labels and the theme index have the same authors.** The question set, its expected passages and the editorial theme index were all written during this project's development, with AI assistance. A passage also counts as relevant when it belongs to a listed theme. The concept channel therefore retrieves exactly what the metric rewards. An independent set, written by people who have not seen the theme index, is the most valuable next step.
2. **The set is small.** It has 70 labelled questions, of which only 8 are Hindi and 8 Hinglish. One question moves Hindi or Hinglish hit@8 by 12.5 points.
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
| Browser, `make e2e` | 194: 97 each on desktop Chrome and a Pixel 7. 178 run: 96 on desktop and 82 on the Pixel 7. The 16 skipped are by design: 12 set their own viewports and run on desktop only, 2 navigation tests each run on one device, and the chapter rail and step list exist on large screens only. | See below |

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
  - its six chapters, in order;
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
- no console errors or warnings on key pages, in either theme.

None of them needs a model: the backend tests use a fake one, and the browser tests pass with or without a key. With a key configured, the ask test makes real model calls.
