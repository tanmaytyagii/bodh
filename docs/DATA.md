# Data: sources, provenance and ingestion

Every piece of text that the app presents as scripture comes from a record that names its edition and links back to a place where it can be checked. Editorial material is stored and labelled separately: theme summaries, story analyses and context notes.

## Sources and licences

| Edition (id) | Used for | Licence | Where |
| --- | --- | --- | --- |
| Annie Besant, *The Bhagavad-Gita, or The Lord's Song*, 4th edition, G. A. Natesan & Co., Madras, 1922 (`besant-1922`) | Gita Sanskrit and English translation, Besant's footnotes, chapter titles | Public domain (translator died 1933). Wikisource transcription. | [Wikisource](https://en.wikisource.org/wiki/Bhagavad-Gita_(Besant_4th)), with page scans |
| `gita/gita` dataset, `verse.json` at commit `700c015` (`gita-json`) | Cross-check of the Gita Sanskrit only. Never displayed. | The Unlicense. The Sanskrit itself is ancient. | [GitHub](https://github.com/gita/gita/blob/700c015912aa3f17ec2f275b9cfdd4f04278f47f/data/verse.json) |
| Swami Paramananda, *The Upanishads (Isa, Katha, Kena)*, 1919 (`paramananda-1919`) | English translation and the translator's commentary for the Isha, Katha and Kena Upanishads | Public domain (published 1919; translator died 1940). Project Gutenberg eBook #3283. | [Project Gutenberg](https://www.gutenberg.org/ebooks/3283) |

Only the Devanagari is taken from the cross-check dataset. Its translations and word meanings belong to their own publishers and are not used.

### What the corpus contains

| Source | Verses | Divisions | Sanskrit |
| --- | --- | --- | --- |
| Bhagavad Gita | 701 | 18 chapters | Yes, with IAST transliteration |
| Isha Upanishad | 18 | 1 part | No (the edition prints none) |
| Katha Upanishad | 119 | 6 parts (adhyāya 1–2 × vallī 1–3) | No |
| Kena Upanishad | 34 | 4 parts | No |

The Gita has 701 verses because Besant's edition counts 35 verses in chapter 13; many editions count 34. The verse count for each chapter is checked during the build.

## Provenance

Each passage carries a `provenance_status`. The UI shows it on every verse:

| Status | Meaning | Count | Shown as |
| --- | --- | --- | --- |
| `verified` | The Sanskrit agrees with the independent edition, exactly (479) or apart from spelling conventions (197) | 676 | "Sanskrit cross-checked" |
| `reviewed` | The Sanskrit differs from the independent edition, and an editor confirmed the printed reading | 0 | "Variant reading — reviewed" |
| `needs_review` | The Sanskrit differs from the independent edition and has not been reviewed yet. It is shown as printed. | 25 | "Variant reading — under review" |
| `unverified` | There is no independent text to check against yet (the Upanishads, which are translation only) | 171 | "Translation only" |

**Spelling conventions** (`normalize.orthographic_key`). Editions legitimately differ in conventions, and the comparison folds these differences:

- final `m` written as anusvāra;
- class nasals written as anusvāra;
- the consonant doubling of older printings (कर्म्म for कर्म, युद्ध्यस्व for युध्यस्व);
- word division;
- visarga sandhi;
- avagraha;
- candrabindu written as anusvāra;
- a few encoding artefacts of the transcriptions.

Anything else counts as a real difference.

**Citations.** Every passage has:

- a citation label (edition and page);
- a URL for the transcription;
- for the Gita, the URL of the scan of the printed page where the verse's translation begins.

The Upanishad citations link to the verse's anchor in the Gutenberg HTML. The Katha Upanishad's conventional reference (adhyāya.vallī.verse) is kept in `metadata.standard_ref`, so `katha.2.1` displays as "Katha 1.2.1".

**Corrections.** Every place where the displayed text differs from the printed edition is recorded on the passage and shown on its verse page, in "Corrections to the source text". Each record has the printed text, the correction, whether it was applied, and the basis for the decision.

| Kind | Applied | Kept as printed | Policy |
| --- | --- | --- | --- |
| Sanskrit | 12 | 2 | Wikisource transcribers' `[sic]` corrections are kept only when the independent edition supports them. When it agrees with the printed reading, the correction is reverted. |
| Translation | 12 | 3 | `[sic]` corrections of the English, plus two transcription errors in the Gutenberg Katha text ("resected" → "reflected", "great-soured" → "great-souled"). Deliberate archaisms such as "divers" are kept. |
| Verse number | 9 | – | English verse numbers that the 1922 printing misprinted or left out. The numbering follows the Sanskrit. |
| Speaker | 1 | – | A speaker label missing from the English (6.33, "Arjuna said:"), restored from the Sanskrit |

The transliteration is always generated from the Devanagari actually shown (`to_iast`), and the validator rejects any mismatch.

## The ingestion pipeline

```bash
cd backend
.venv/bin/python -m app.ingestion fetch [--refresh]   # download raw files (cached)
.venv/bin/python -m app.ingestion build               # parse, cross-check, review, validate → data/processed
.venv/bin/python -m app.ingestion load [--reembed]    # migrate, upsert into Postgres, embed changed text
.venv/bin/python -m app.ingestion all                 # all three
```

`make corpus` runs fetch and build. `make ingest` runs load.

1. **Fetch** (`ingestion/fetch.py`).
   - Each source is cached under `data/raw/<source>/`, with a `manifest.json` that records the URL, the SHA-256 and the fetch time.
   - Requests identify the client (set `INGEST_USER_AGENT` to something with a contact URL, as Wikimedia asks), wait between requests and honour `Retry-After`.
   - Cached files are reused unless you pass `--refresh`.
2. **Build** (`ingestion/pipeline.py`):
   1. The source adapters parse the raw files (`ingestion/sources/`).
   2. The Gita Sanskrit is cross-checked (`gita_crosscheck.cross_check`).
   3. Editorial reviews are applied (`gita_crosscheck.apply_reviews`; see below).
   4. Concept links and sensitivity notes are attached.
   5. Everything is validated.

   If validation finds any error, nothing is written except `validation_report.md`. Otherwise `data/processed/` gets the following files:
   - `passages.jsonl`, `sources.json`, `editions.json`, `concepts.json` and `stories.json`;
   - `validation_report.md`: statistics, errors, and every verse that needs review;
   - `manifest.json`: build time, the SHA-256 of `passages.jsonl`, and the checksums of every raw and curated input. Two builds from the same inputs are therefore comparable.
3. **Load** (`storage/loader.py`).
   - Applies migrations.
   - Upserts sources, editions, passages, concepts and stories, and deletes rows that are gone.
   - Computes embeddings only for text whose hash changed, unless you pass `--reembed`.

The processed corpus is committed, so a fresh checkout runs without fetching anything.

### What the validator checks

**Errors** (the build is refused):

- duplicate ids;
- unknown sources or editions, or an edition that does not list the passage's source;
- an empty translation;
- a citation without an https URL;
- Sanskrit without a transliteration, or with one that does not match it;
- Devanagari inside a translation, or Latin letters inside Sanskrit;
- passages out of order;
- verse counts that differ from a source's declared divisions;
- a theme or story that names a missing passage;
- a quotation in an editorial summary that does not occur verbatim in its linked passages;
- a theme's Sanskrit term that does not occur in any linked verse's transliteration;
- a sensitivity note for an unknown passage;
- an invalid editorial review.

**Warnings** (listed in the report):

- every verse that needs review;
- the number of translation-only passages for each edition.

## Editorial data (`backend/data/curated/`)

The project writes this data; it is not quoted from a source. The API marks it `editorial: true`, and the UI labels it "Editorial".

- **`concepts.yaml`**: 36 themes, such as "Steadiness in success and failure" or "How desire turns into anger". Each has a summary, caveats, the life situations it fits, linked passages and related themes. Every quotation in a summary must occur word for word in a linked passage. A Sanskrit `term` must occur in a linked verse's transliteration (a stem match, so inflected forms count).
- **`stories.yaml`**: story records with characters, summary, dilemma, choices and consequences, lessons, caveats, verbatim excerpts (passage ids) and related passages. The only story so far is Nachiketas and Death (Katha Upanishad). Quotations are checked against the excerpts.
- **`sensitivities.yaml`**: context notes for passages that are easily misused, such as war exhortations, the deathless self, varṇa and birth, or Arjuna's despair. The notes go to the model along with the passage. `exclude_in_crisis: true` keeps a passage out of answers to someone who may be at risk. See [SAFETY.md](SAFETY.md).
- **`reviews.yaml`**: editors' decisions on flagged verses (next section).

## Reviewing flagged verses

25 Gita verses differ from the cross-check edition. They are served as printed, with a visible "under review" flag, until an editor resolves them.

1. **Find them.** They are listed under "Needs review" in `data/processed/validation_report.md`, with the differing words (printed → cross-check). Each verse's page shows the same difference and links to the scan of the printed page.
2. **Compare.**
   - Check the scan, to see whether the transcription matches the print.
   - Check at least one other printed edition.
   - Some differences may be typing errors in either edition, so neither text is assumed to be right.
3. **Record the decision** in `data/curated/reviews.yaml`, with your name, the date and what you compared:
   - `keep_printed`: the printed reading stands. The verse becomes `reviewed`, and the note is shown on its page.
   - `correct`: the print has a misprint. Give `printed` (the text exactly as it appears in the verse) and `corrected`. The correction is accepted only if the verse then agrees with the cross-check edition, so corrected Sanskrit always has a published text behind it. The verse becomes `verified`, and the correction is listed with its basis.
4. **Rebuild and reload:** `make corpus && make ingest`. The build refuses a review of a verse that is not flagged, a `printed` text that is not in the verse, or a correction that does not resolve the difference.

If the Wikisource transcription itself is wrong, please also correct it on Wikisource.

## Adding a source

An adapter is a module in `backend/app/ingestion/sources/`. Use `paramananda_upanishads.py` as the template. It needs:

- **Polite downloading:**
  - `fetch(refresh=False)` downloads through `SourceCache`.
  - Pin a version or revision wherever the host allows it.
- **Parsing and checks:**
  - `build()` returns the source records (with divisions and their passage counts), the passages and a list of parse issues.
  - Keep an expected-count table per division, so parsing errors fail the build instead of silently dropping verses.
- **An `Edition` record:**
  - translator, year, publisher, licence, URL;
  - `source_ids` for every source it covers;
  - role `primary` or `cross_check`.

Each passage needs these fields:

| Field | Content |
| --- | --- |
| `id` | `<prefix>.<division>.<verse>`, with a short new prefix |
| `path` | `<division>/<verse>`, used in URLs |
| `position` | Increasing within the source |
| `citation` | A per-passage URL (anchor or page) and a scan URL if one exists |
| `sanskrit` | Only from a published edition. Generate `transliteration` with `to_iast`. |
| `provenance_status` | Starts as `unverified`. Add a cross-check against an independent edition if one exists. |
| `translator_notes` | The translator's own notes, kept separate from the translation |

Then:

1. **Register the adapter** in `pipeline.fetch_all` and `pipeline.build_corpus`.
2. **Add the edition** to the corpus editions.
3. **Web:** add the id prefix to `SOURCE_FOR_PREFIX` in `web/src/lib/passages.ts`, so inline citations link correctly.
4. **Curated data:**
   - Add sensitivity notes for passages that are easily misused.
   - Link the strongest passages to themes.
   - Add evaluation cases to `backend/app/evaluation/dataset.yaml`.
5. **Tests:** add the per-source counts to `tests/test_validation.py` and a parsing test to `tests/test_corpus.py`.
6. **Licence:** confirm the licence and say what it is in the edition record. Use public-domain or openly licensed texts only.

### Adding a story

Add an entry to `stories.yaml`:

- `excerpt_ids` are the verbatim passages that tell the story, in order.
- `related_passage_ids` are other passages worth reading with it.
- Keep the summary and analysis faithful to the excerpts, quote only their exact words, name characters as the cited translation does, and add caveats where a reader might over-apply the story.

Run `make corpus` to validate. A story whose excerpts are not in the corpus cannot be added: add the source first.
