# Independent evaluation questions

BODH's retrieval is measured on [226 labelled questions](EVALUATION.md#the-question-set). Those questions, their labels, the editorial theme index and the vocabulary maps were all written by the same people, with AI assistance. Results on them are likely optimistic: the questions use the words the maps know, and a passage counts as relevant when it belongs to a theme the same authors chose.

An independent set removes that bias:

- The questions are written by people who have not seen the theme index, the labelled questions or the vocabulary maps.
- The expected passages are chosen by reading the texts, before any retrieval is run on the questions.

**Status, 2026-10-20: none collected.** [`backend/app/evaluation/independent.yaml`](../backend/app/evaluation/independent.yaml) is empty, and no result in [EVALUATION.md](EVALUATION.md) is on independent questions. The workflow below has been tested end to end on synthetic fixtures only.

## 1. What authors and labellers receive

Share only these files. They contain no theme names, labels, vocabulary maps or retrieval output:

| File | For | What it is |
| --- | --- | --- |
| [`independent/author-brief.md`](independent/author-brief.md) | question authors | What to write, in English and Hindi: Hindi and Hinglish first, colloquial wording, own spelling, code-switching, modern situations, and questions the texts cannot answer |
| [`independent/questions-template.csv`](independent/questions-template.csv) | question authors | The spreadsheet to fill in: `question`, `language`, and optionally `category` and `note` |
| [`independent/labelling-guide.md`](independent/labelling-guide.md) | labellers | How to choose passages from the texts alone, the passage ids, and what "clearly addresses" means |
| the labelling sheet, from `sheet` | labellers | The questions and empty answer columns |
| the texts, from `passages` | labellers | Every passage's id, reference, speaker and translation, to read and search |

Do not send this document, [EVALUATION.md](EVALUATION.md) or the repository. They quote evaluation questions and vocabulary.

## 2. Collecting questions

1. **Find authors** who have never used BODH or worked on it.
   - Hindi and Hinglish come first: people who type Hindi in Devanagari, and people who type it in Latin letters.
   - Ask for about 30 questions each, from several authors, so that no single voice dominates.
   - Aim for at least 60 in-scope questions per language, and 20 out of scope overall (see [sample size](#sample-size)).
2. **Give each author a pseudonym** (A1, A2, …) and send them the brief and the template.
   - Keep any record of who is behind a pseudonym outside the repository, or keep none.
   - The brief tells authors that their questions will be published under the pseudonym, and that they may withdraw until the set is frozen.
3. **Import each file as it arrives**, from `backend/`:

   ```bash
   .venv/bin/python -m app.evaluation.independent import questions-A1.csv --author A1 --written-on 2026-11-02
   ```

   The import is all or nothing. A file with a missing or unknown column, an unknown language or category, a malformed row, or a question already in the set or in `dataset.yaml` adds nothing, and every problem is listed.

   Each question gets:
   - an id (`ind-<language>-<n>`);
   - `authorship: independent`;
   - a `batch` naming the author, the date, the file and its checksum.

   Before importing, remove anything that identifies a person, and say so in that question's `note`. Correct nothing else: typos and spelling are part of the test.
4. **Run `check`.** It lists:
   - every problem;
   - questions that are nearly the same as another, for a person to compare;
   - counts by language, category, author and decision.

## 3. Labelling

1. **Choose at least two labellers** (L1, L2, …).
   - They may be authors, but must not label their own questions.
   - Nobody runs BODH on the questions until the set is frozen. The evaluator enforces this: it refuses an unfrozen set.
2. **Write the files they need:**

   ```bash
   .venv/bin/python -m app.evaluation.independent sheet labels-L1.csv     # the questions and empty answer columns
   .venv/bin/python -m app.evaluation.independent passages texts.csv      # every passage, to read and search
   ```

   Send each labeller a sheet, `texts.csv` and the [labelling guide](independent/labelling-guide.md). They work alone.
3. **Record each completed sheet:**

   ```bash
   .venv/bin/python -m app.evaluation.independent labels labels-L1.csv --labeller L1 --labelled-on 2026-11-05
   ```

   Each labeller's decision is kept under the question's `annotations`, and a sheet with any problem records nothing. Problems include:
   - an unknown question or passage;
   - a row both out of scope and with passages;
   - a question this labeller has already labelled.
4. **Make final labels:** `resolve`.
   - Where the labellers agree, or only one has labelled, the label becomes final, with `decision: agreed` or `single`.
   - Every disagreement is listed. Settle each one by reading the passages together, then edit the question in `independent.yaml`: set `expected` (or `out_of_scope: true`), `labelled_by` (the adjudicator's pseudonym), `labelled_on`, `decision: adjudicated`, and a `note` giving the reason.
   - The labellers' own decisions stay in `annotations`. `check` refuses an adjudicated label without a note, and a disagreement presented as agreed.

## 4. Freezing and evaluating

1. **`freeze`** appends the file's checksum, the date and the number of questions to `independent.lock`. It refuses:
   - a set with any problem;
   - a question without a final label;
   - any question that is not `authorship: independent`;
   - a damaged lock file.

   Commit `independent.yaml` and `independent.lock` together.
2. **Evaluate only changes chosen beforehand on the dev split** of `dataset.yaml`, once, on both backends:

   ```bash
   .venv/bin/python -m app.evaluation.retrieval --dataset independent
   .venv/bin/python -m app.evaluation.retrieval --dataset independent --backend postgres
   ```

   The evaluator refuses a set that:
   - was never frozen, or has changed since;
   - has a lock that does not match it;
   - holds anything but valid independent questions.

   Relevance is the listed passages alone: independent questions get no credit for themes, unlike the main set.
3. **Report the results** in [EVALUATION.md](EVALUATION.md):
   - the version the report prints: number, date, checksum prefix and question count;
   - for every language, the number of questions, hit@8 with its 95% interval (`hit@k_ci`), and out-of-scope questions labelled weak.

### Sample size

Wilson 95% intervals for a hit rate near 60%:

| Questions | Interval |
| --- | --- |
| 8 | 31%–86% |
| 30 | 42%–75% |
| 60 | 47%–71% |
| 100 | 50%–69% |
| 200 | 53%–67% |

Below about 30 questions, report counts ("4 of 9") rather than rates.

### Rehearsing without real questions

`backend/tests/fixtures/independent/` holds synthetic questions and two labellers' sheets, one of which disagrees on purpose. They were written by the developers, are marked as fixtures, and are never independent. `tests/test_independent.py` runs the whole workflow on them. To rehearse by hand, point the tools at a scratch copy:

```bash
cp app/evaluation/independent.yaml /tmp/rehearsal.yaml
.venv/bin/python -m app.evaluation.independent --file /tmp/rehearsal.yaml import tests/fixtures/independent/questions.csv --author FIXTURE-A --fixture
.venv/bin/python -m app.evaluation.independent --file /tmp/rehearsal.yaml labels tests/fixtures/independent/labels-L1.csv --labeller FIXTURE-L1
.venv/bin/python -m app.evaluation.independent --file /tmp/rehearsal.yaml labels tests/fixtures/independent/labels-L2.csv --labeller FIXTURE-L2
.venv/bin/python -m app.evaluation.independent --file /tmp/rehearsal.yaml resolve    # one disagreement, to adjudicate
.venv/bin/python -m app.evaluation.independent --file /tmp/rehearsal.yaml --lock /tmp/rehearsal.lock freeze --fixtures
```

The real set refuses fixtures, and so does the evaluator.

## 5. After the results are seen

A frozen version is spent once anyone has looked at its results:

- **Don't edit its questions or labels.** A corrected label goes into a new frozen version, reported separately with the reason.
- **Don't let it shape the system.** Never add its words to the vocabulary maps, the theme index or the prompts, and never choose a setting by its results. Doing any of these turns it into a dev set.
- **Collect a new set for the next independent measurement.**

## 6. Leakage guards

`python -m app.evaluation.independent leakage` lists two things, and `tests/test_independent.py` fails on any new one:

1. **Vocabulary-map words** (`SYNONYMS`, `CROSS_LINGUAL`) that held-out or independent questions use and no dev question does.
2. **Runs of five words** from held-out or independent questions that appear in the vocabulary maps, the prompts or the theme index.

On 2026-10-20 the audit found:

- **14 words**, all in the maps since 2026-10-13. That is before the held-out questions were written on 2026-10-19, so they weren't fitted to them.
- **"binge"**, added on 2026-10-19 and used only by the held-out question `stress-eating`. It made no difference to that question (rank 1 with or without it), and it was removed.
- **One phrase.** The held-out question `k-mind-like-wind` asks for BG 6.34 in words that a theme summary has used since 2026-10-13. The question echoes the theme index, not the other way round. This is the same-author bias an independent set removes.

The experiments in `app.evaluation.experiments` read only `dataset.yaml`, and settings are chosen on its dev split.

**What the guards cannot catch.** For example, someone who has read the held-out questions might add a synonym for a *related* word. The rule that prevents this is a practice, not a check: read only the dev split when choosing a change.

## 7. What counts as independent

- **Independent.** The author did not see the theme index, the labelled questions, the vocabulary maps or BODH's results, and the labeller labelled before seeing any retrieval output.
- **Not independent:**
  - questions written by BODH's developers, or by an AI assistant used in its development;
  - by anyone who has worked with the evaluation material.

  That covers all of `dataset.yaml`.
- **Written by a model.** A language model that never saw the material is *blind* to it, but it shares the biases of the models that built the system. Its questions do not belong in `independent.yaml`, which accepts only `authorship: independent`. If you collect them, keep them in a separate file and report them separately, never as independent questions written by people.
- **Synthetic fixtures** test the tooling and nothing else.
