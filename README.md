# BODH (बोध)

**Ancient Wisdom. Clearer Living.**

BODH helps people think through real-life problems with verified passages from the Bhagavad Gita and three principal Upanishads. A person describes a situation. The app retrieves relevant passages from a validated corpus. A language model then explains them in context and suggests practical next steps, and every citation is checked against the passages the model was given.

*Bodh* (बोध) means understanding: awareness, discernment, insight. The product's guiding idea is *understand deeply, choose consciously*: it shows what the texts say and where they say it, and leaves the decision to the person.

The brand (name, Devanagari name, tagline, description, the mark and its colours) is defined in one file, [`web/src/lib/brand.ts`](web/src/lib/brand.ts); see [web/README.md](web/README.md#brand). The project was developed under the working name Scriptural Wisdom, which some infrastructure names keep: the repository, the Compose project (and so its volumes), the database credentials and the Python package. Renaming those would orphan existing data, so they stay.

## What it does

- **Ask.** Describe a situation in English, Hindi or Hinglish. The answer has seven parts:
  1. Understanding your situation.
  2. Relevant passages: Sanskrit, transliteration, translation with the translator's name, and a link to the source.
  3. What the teaching says, with the text, the translator's notes and the AI's interpretation kept apart.
  4. How it connects to your life, and where it does not.
  5. Concrete next steps.
  6. A reflective question.
  7. Follow-up conversation.
- **Grounded answers.** The model may cite only the passages retrieved for that question. Citations of anything else are removed, and quoted wording is checked word for word against the translations. When the sources do not address a question, the answer says so.
- **Scripture explorer.** Browse every chapter and verse. Search by meaning, by keyword or by half-remembered Sanskrit (`karmanye vadhikaraste`). Each verse page shows the surrounding verses, the scan of the printed page, related passages and provenance.
- **Themes and stories.**
  - An editorial index of 36 themes.
  - The story of Nachiketas from the Katha Upanishad, with its dilemma, choices and lessons.
  - Both are labelled as editorial, and every quotation in them is validated against the text.
- **Safety first.** A deterministic crisis check runs before anything else. It shows Indian and international helplines whether or not a language model is configured.
- **Private by default.**
  - No accounts.
  - Saved reflections stay in the browser.
  - The server does not store questions. Feedback includes the question only if the person ticks a box to share it.
- **Works without an API key.** Without model credentials the app still searches and shows verified passages, and says plainly that no AI guidance was generated.

## The corpus

| Source | Passages | Edition | Sanskrit |
| --- | --- | --- | --- |
| Bhagavad Gita | 701 | Annie Besant, 4th edition (1922), Wikisource transcription | 676 verses agree with an independent edition. 25 differ and are shown as printed, flagged for review. |
| Isha, Katha and Kena Upanishads | 18 + 119 + 34 | Swami Paramananda (1919), Project Gutenberg | This edition prints no Sanskrit, so these verses are shown as translation only. |

All texts are in the public domain. Sources, licences, provenance and the review workflow are in [docs/DATA.md](docs/DATA.md).

## Quick start

You need Python 3.11, Node.js 20.9 or newer, and Docker for PostgreSQL.

```bash
cp .env.example .env   # optional: add ANTHROPIC_API_KEY to enable AI guidance
make setup             # Python virtualenv + npm install
make ingest            # start PostgreSQL + pgvector, load the corpus, compute embeddings
make api               # FastAPI on http://localhost:8000
make web               # Next.js on http://localhost:3000 (in a second terminal)
```

- **No Docker?** Set `RETRIEVAL_BACKEND=memory` in `.env` and skip `make ingest`. The API then serves the processed corpus from disk.
- **Everything in containers:** `make up` builds and runs the database, API and web app.
- **The embedding model** (about 120 MB) downloads on first use and is cached under `backend/.cache`.

The processed corpus is committed in `backend/data/processed`, so nothing needs to be downloaded from the source sites. `make corpus` re-fetches the sources (cached) and rebuilds the corpus with validation.

## Configuration

Every setting is an environment variable read from `.env`, and all of them are documented in [.env.example](.env.example). These are the ones you are most likely to change:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_PROVIDER` | `anthropic` | `anthropic`, `openai` (any OpenAI-compatible endpoint, including Ollama) or `none` |
| `ANTHROPIC_API_KEY` | none | Required for AI guidance with the default provider |
| `LLM_MODEL` | `claude-opus-5-5` | Model for both steps. `LLM_FAST_MODEL` overrides it for the understanding step. |
| `LLM_BASE_URL`, `OPENAI_API_KEY` | none | For OpenAI-compatible providers |
| `RETRIEVAL_BACKEND` | `postgres` | `postgres` (pgvector + full-text search) or `memory` |
| `DATABASE_URL` | `postgresql://wisdom:wisdom@localhost:54329/wisdom` | Matches the Compose database |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` | `local`, `intfloat/multilingual-e5-small` | In-process ONNX embeddings with no key; an OpenAI-compatible endpoint is also supported |
| `API_URL` | `http://127.0.0.1:8000` | Where the web server reaches the API |
| `NEXT_PUBLIC_SITE_URL` | none | The site's public address, for absolute URLs in link previews (build time) |
| `NEXT_PUBLIC_APP_NAME` | `BODH` | Replaces the product name alone, for a deployment of its own (build time). The rest of the brand is in `web/src/lib/brand.ts`. |

## Commands

| Command | What it does |
| --- | --- |
| `make test` | Backend unit and integration tests. No Docker, network or API key needed. |
| `make lint` | ruff, mypy, TypeScript and ESLint |
| `make e2e` | Playwright tests on desktop and mobile, including axe accessibility checks. Start the API first; Playwright starts the web app if none is running. |
| `make eval` | Retrieval evaluation on 74 labelled questions |
| `make eval-answers` | Answer evaluation through the configured model. It makes real model calls. |
| `make corpus` / `make ingest` | Rebuild the processed corpus / load it into PostgreSQL |

## Project layout

```
backend/
  app/ingestion/    fetch → parse → cross-check → validate → build; load into Postgres
  app/retrieval/    embeddings and hybrid retrieval
  app/generation/   prompts, model providers, safety, verification, the answer pipeline
  app/api/          HTTP routes and response views
  app/evaluation/   retrieval and answer evaluation
  data/             raw source cache, curated editorial data, processed corpus
  migrations/       SQL schema
  tests/
web/                Next.js app: Ask, Explore, verse, theme and story pages, reflections, the BODH brand
docs/               architecture, data, API, evaluation, deployment, safety
```

## Status and known limitations

- **Answer quality with Claude has not been evaluated.** No API key was available during development. The full pipeline was run end to end with a small local model (`deepseek-r1:1.5b` through Ollama). That model kept to the grounding rules, with no invented citations, but its guidance was poor. Use a capable model, and run `make eval-answers` once a key is configured.
- **Retrieval** finds a relevant passage in the top 8 for 74% of the 70 labelled questions with the default PostgreSQL backend: English 72%, Hindi 100%, Hinglish 63%. These figures are likely optimistic; [docs/EVALUATION.md](docs/EVALUATION.md) explains why.
- **Sanskrit:**
  - 25 Gita verses differ from the cross-check edition and are waiting for editorial review.
  - The Upanishads have no Sanskrit yet.
- **Not built yet:**
  - Mahabharata and Ramayana stories.
  - Traditional commentaries such as Shankara's.
  - Upanishad Sanskrit with a second translation to check against.
  - Optional accounts and cloud sync.
  - A reranker.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): components, the answer pipeline, retrieval and verification
- [Data](docs/DATA.md): sources, licences, provenance, ingestion, adding sources, reviewing variants
- [API](docs/API.md): endpoints, the answer format and streaming events
- [Evaluation](docs/EVALUATION.md): method, current numbers, ablations, embedding study
- [Deployment](docs/DEPLOYMENT.md): containers, database, configuration, operations
- [Safety and privacy](docs/SAFETY.md): crisis handling, sensitive passages, data retention
