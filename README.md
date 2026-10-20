<h1 align="center">
  <img src="assets/brand/social-preview.png" width="760" alt="BODH (बोध): Ancient Wisdom. Clearer Living. Understand deeply. Choose consciously.">
</h1>

<p align="center">
  <strong>Bring a real-life question to the Bhagavad Gita and the Upanishads.</strong><br>
  BODH finds the passages that speak to it and shows them exactly as their editions print them, with the Sanskrit where the edition has it and a link to the source, keeping any interpretation clearly apart from the text.
</p>

<p align="center">
  <a href="https://github.com/tanmaytyagii/bodh/actions/workflows/ci.yml"><img src="https://github.com/tanmaytyagii/bodh/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/python-3.11-3776ab" alt="Python 3.11">
  <img src="https://img.shields.io/badge/Next.js-16-16171a" alt="Next.js 16">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/API.md">API</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

![BODH's home screen in the light theme: the headline "Ancient wisdom. Your life, today.", a box to describe your situation with example questions, and a golden armillary sphere resting in an engraved bowl.](assets/screenshots/01-homepage.png)

## Why BODH

*Bodh* (बोध) means understanding: awareness, discernment, insight. People turn to the Gita when life gets hard, but what they find online is often a misquotation, a verse lifted out of context, or a chatbot that invents scripture with confidence. BODH is built the other way round:

- **The texts are never generated.** A language model may only point to passages by their ids. The app shows the stored text, exactly as its edition prints it, so a model cannot misquote a verse that you see.
- **Everything is checkable.** Each passage names its translator and edition and links to its source: for the Gita, the scan of the printed page. The Gita's Sanskrit is cross-checked against an independent edition, and every difference is flagged, not hidden.
- **Interpretation is labelled as interpretation.** Source text, the translator's notes, editorial material and AI-written guidance each look different, everywhere.
- **You decide.** Its guiding idea comes from the end of the Gita itself (18.63): reflect on the teaching fully, then choose. *Understand deeply. Choose consciously.*

## Features

- **Ask in your own words**, in English, Hindi or Hinglish, and continue with follow-up questions.
- **Verified passages**: a public-domain translation with the translator's own notes, a citation that opens the source (for the Gita, the printed page), and, for the Gita, the Sanskrit with an IAST transliteration generated from it.
- **Grounded guidance, when a model is configured** (Anthropic by default, or any OpenAI-compatible endpoint, including Ollama): what each passage says, its context, why it may apply, one way to apply it and what it does *not* mean, then concrete steps and a question to reflect on. A verifier removes any citation of a passage that was not retrieved, and any quotation that does not occur in the sources.
- **No key? Still useful.** Without a model, answers are the passages alone, and say so plainly.
- **Safety first.** A deterministic check for crisis language (English, Hindi, Hinglish) runs before any model and answers with helplines instead of scripture. Passages that are easily misread, such as the exhortations to fight, carry context notes and are withheld from someone at risk.
- **A scripture explorer.** Browse all 872 passages, search by meaning, by the words of the translation or by half-remembered Sanskrit (`karmanye vadhikaraste`), and read any verse among its neighbours.
- **Themes and stories.** 36 editorial themes grouped into paths ("Hard choices", "The restless mind"), and four stories: Nachiketas and Death, Arjuna's despair at Kurukshetra, the vision of the universal form, and the gods before the mystery in the Kena Upanishad. Every quotation in them is validated against the text.
- **Private by design.** No accounts and no analytics. Questions are not stored on the server. Saved reflections stay in your browser, with your notes, and export to Markdown.
- **Made to be read.** Light, dark or the system's appearance; designed from a 360px phone to an ultrawide monitor; keyboard accessible; checked with axe in both themes; reduced motion respected. An observatory after Jaipur's Jantar Mantar, drawn in three.js, turns slowly behind the landing story.

## How it works

```mermaid
flowchart LR
  browser(["Browser"])

  subgraph web["Next.js web app (web/)"]
    pages["Pages<br/>Ask, Explore, verses, themes, stories,<br/>reflections, settings"]
    proxy["/api/* proxy<br/>allowlisted, streams events"]
  end

  subgraph api["FastAPI service (backend/)"]
    routes["Routes<br/>/ask/stream, /search, /passages, …"]
    service["Answer pipeline<br/>safety · understand · retrieve ·<br/>generate · verify"]
    retriever["Hybrid retrieval<br/>vectors, full text, romanized Sanskrit,<br/>themes"]
  end

  store[("PostgreSQL 17 + pgvector<br/>or the in-memory backend")]
  llm["Language model, optional<br/>Anthropic or OpenAI-compatible"]
  corpus[["Processed corpus<br/>backend/data/processed"]]
  sources[["Wikisource, Project Gutenberg,<br/>gita/gita (cross-check)"]]

  browser --> pages
  browser -- "questions, feedback" --> proxy
  pages -- "server components read the corpus" --> routes
  proxy --> routes
  routes --> service
  service --> retriever
  retriever --> store
  service --> llm
  sources -- "make corpus: fetch, parse,<br/>cross-check, validate" --> corpus
  corpus -- "make ingest: load, embed" --> store
```

1. **Safety.** Regular expressions catch crisis language first, with or without a model.
2. **Understanding.** The model restates the situation and turns it into searches phrased the way the translations speak ("fruit of action", "balanced in success and failure").
3. **Retrieval.** Reciprocal-rank fusion of semantic search (multilingual-e5-small, run locally), full-text search, trigram matching of romanized Sanskrit and the editorial theme index.
4. **Generation.** The model writes the answer from the retrieved passages only, and refers to them by id.
5. **Verification.** Citations of anything not retrieved are removed, and quoted wording is checked word for word against the translations. Every change is reported with the answer.

The answer streams to the browser as server-sent events: progress, the passages as soon as they are found, then the answer. The details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## The texts

| Source | Passages | Edition | Sanskrit |
| --- | --- | --- | --- |
| Bhagavad Gita | 701 | Annie Besant, 4th edition (1922), from the Wikisource transcription, with page scans | Shown, and cross-checked against the [gita/gita](https://github.com/gita/gita) dataset: 676 verses agree; 25 differ and are flagged for review |
| Isha, Katha and Kena Upanishads | 18 + 119 + 34 | Swami Paramananda (1919), Project Gutenberg eBook #3283 | Not printed in this edition, so these are translation only |

Both editions are in the public domain. Sources, provenance, corrections and the review process are in [docs/DATA.md](docs/DATA.md).

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, three.js with React Three Fiber |
| API | Python 3.11, FastAPI, Pydantic 2, Uvicorn |
| Retrieval | PostgreSQL 17 with pgvector and pg_trgm, or an in-memory backend; fastembed (ONNX) with `intfloat/multilingual-e5-small` |
| Generation | Anthropic Messages API with structured outputs, or any OpenAI-compatible endpoint |
| Ingestion | httpx, Beautiful Soup, indic-transliteration, PyYAML |
| Quality | pytest, ruff, mypy; Playwright with axe-core; ESLint; GitHub Actions |

## Quick start

You need Python 3.11, Node.js 20.9 or newer, and Docker (Docker Desktop on a Mac) for PostgreSQL. Without Docker, see [Without Docker](#without-docker) below.

**The first time**, with Docker running:

```bash
git clone https://github.com/tanmaytyagii/bodh.git && cd bodh
cp .env.example .env   # optional: add ANTHROPIC_API_KEY to enable AI guidance
make setup             # Python virtualenv + npm install
make ingest            # start PostgreSQL + pgvector, apply migrations, load the corpus, compute embeddings
make api               # FastAPI on http://127.0.0.1:8000
make web               # Next.js on http://localhost:3000, in a second terminal
```

**Every time after that**, start Docker, then run `make db`, `make api` and `make web`. The database keeps its data between runs. `make ingest` is needed again only when the corpus changes, and is safe to re-run. `make down` stops the database.

- **No model key?** Everything works; answers are verified passages only, and say so. Set `LLM_PROVIDER=none` to make that explicit.
- **The embedding model** (about 130 MB) downloads on first use and is cached under `backend/.cache`.
- **Windows:** the Makefile needs `make` and a POSIX shell. Use WSL 2; native Windows has not been tested.

The processed corpus is committed in `backend/data/processed`, so nothing needs to be downloaded from the source sites. `make corpus` re-fetches the sources (cached and checksummed) and rebuilds the corpus with validation.

### Without Docker

Run `make api-memory` instead of `make db` and `make api` (or set `RETRIEVAL_BACKEND=memory` in `.env`). The API then serves the committed corpus from memory, and everything works as it does with PostgreSQL, except that:

- full-text ranking uses BM25 instead of PostgreSQL's full-text search, so results can differ a little ([docs/EVALUATION.md](docs/EVALUATION.md) has numbers for both);
- reports sent with "Report an issue" are written to `backend/.cache/feedback.jsonl`, not to the database;
- the passages are embedded on the first start, and cached under `backend/.cache`.

### Troubleshooting

| You see | Why | What to do |
| --- | --- | --- |
| "The guidance service is not reachable right now" when you ask a question | The web app cannot reach the API at `API_URL` (default `http://127.0.0.1:8000`): it is not running, or it failed to start. The web app's terminal logs the address it tried. | Check `curl http://127.0.0.1:8000/health`. Start the API with `make api` (or `make api-memory`), and read its terminal for the reason it stopped. |
| `DatabaseUnavailable: Cannot connect to PostgreSQL at localhost:54329/wisdom` | The database is not running, usually because Docker was not started or was restarted | Start Docker, then `make db`. Its data is kept. Or use `make api-memory`. |
| `The database has no passages` | The database is new and empty | `make ingest` |
| `[Errno 48] … address already in use` on port 8000 | An earlier `make api` is still running. With `--reload`, it stays alive after its server fails to start, holding the port, until a file changes. | Stop it with Ctrl+C in its terminal. `lsof -nP -iTCP:8000 -sTCP:LISTEN` shows what holds the port. |
| Port 54329 is already taken | Another PostgreSQL is using it | Set `POSTGRES_PORT` (for Docker) and a matching `DATABASE_URL` (for the API) in `.env`. |

### Configuration

Every setting is an environment variable, read from `.env`. All of them are documented in [.env.example](.env.example); these are the ones you are most likely to change:

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
| `NEXT_PUBLIC_SITE_URL` | none | The site's public address, for canonical links and link previews (build time) |
| `NEXT_PUBLIC_APP_NAME` | `BODH` | Replaces the product name alone (build time). The rest of the brand is in [`web/src/lib/brand.ts`](web/src/lib/brand.ts). |

### Commands

| Command | What it does |
| --- | --- |
| `make test` | Backend unit and integration tests. No Docker or model key needed. |
| `make lint` | ruff, mypy, the TypeScript check and ESLint |
| `make e2e` | Playwright tests on desktop Chrome and a Pixel 7, including axe accessibility checks in both themes. They build and serve their own copy of the web app on port 3100, alongside `make web`. Start the API first, and install the browser once with `cd web && npx playwright install chromium`. |
| `make eval` | Retrieval evaluation on 190 labelled questions |
| `make eval-answers` | Answer evaluation through the configured model. It makes real model calls. |
| `make corpus` / `make ingest` | Rebuild the processed corpus / load it into PostgreSQL |
| `make help` | Everything else |

### Docker

```bash
make up     # docker compose --profile app up --build: database, API and web app
make down
```

The Compose file validates, and the containers read the same `.env`. The images themselves have not yet been built and run end to end, so treat this path as unverified; [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers configuration, the reverse proxy and a pre-launch checklist. If port 54329 is taken, set `POSTGRES_PORT`. The API image downloads the embedding model while it builds; pass `--build-arg PRELOAD_MODEL=0` to fetch it on first start instead.

## Screenshots

All of these come from the running app, captured by [`web/scripts/capture-media.mjs`](web/scripts/capture-media.mjs). No language model was configured, so the answer shows verified passages without AI interpretation, exactly as the app labels it.

| | |
| --- | --- |
| ![The question box with a question typed in: "I keep comparing myself with my friends, and I feel left behind. How do I stop?"](assets/screenshots/02-ask-question.png) **Ask.** Describe the situation in your own words. | ![An answer without a language model: a note reading "Passages only — no AI interpretation", six passages found with their themes, and the first, Bhagavad Gita 4.22, in Sanskrit with a "Sanskrit cross-checked" badge.](assets/screenshots/03-grounded-answer.png) **An answer, passages only.** What you get without a model key: verified passages, clearly marked. |
| ![The Explore page: a search box with suggestions, and the library of four texts.](assets/screenshots/04-explore.png) **Explore.** Search by meaning, by keyword or by Sanskrit, or browse the library. | ![Bhagavad Gita 2.47 as a plate: the Sanskrit, its transliteration, Annie Besant's translation, and a link to printed page 35.](assets/screenshots/05-scripture-source.png) **A verse.** Exactly as printed, with its provenance and the printed page. |
| ![The themes chapter of the landing page, with the path "Hard choices" open and its themes listed.](assets/screenshots/09-themes.png) **Themes.** Start from the kind of situation you are in. | ![The reflections page, with a saved question and a box for notes.](assets/screenshots/06-reflections.png) **Reflections.** Saved in this browser only, with your notes. |
| ![The settings page: appearance (System, Light, Dark), saved reflections, and what is stored where.](assets/screenshots/07-settings.png) **Settings.** Appearance, and what BODH keeps, and where. | ![The home screen in the dark theme, with the instrument glowing gold.](assets/screenshots/10-dark-theme.png) **The dark theme.** |

![Two phone screens side by side: the home screen, and Bhagavad Gita 2.47 with its Sanskrit and translation.](assets/screenshots/08-mobile.png)

### Demo

[![A 75-second walk through BODH. Click to open the video.](assets/demo/bodh-demo-poster.png)](assets/demo/bodh-demo.webm)

A 75-second recording of the running app ([WebM, 7.8 MB](assets/demo/bodh-demo.webm)): the landing story, a question and its passages (no model configured), a verse in its context, saving a reflection, and the dark theme. Depending on your browser, GitHub may download the file rather than play it.

To capture the screenshots and the recording again from a running app (`make api`, then `make web` or a production build):

```bash
cd web && node scripts/capture-media.mjs   # BASE_URL=http://localhost:3000 by default
```

## Testing and evaluation

| Check | Command | Covers |
| --- | --- | --- |
| Backend tests | `make test` | Sanskrit normalisation, corpus validation, retrieval in three languages, crisis detection, the verifier, the answer pipeline with a stand-in model, and the HTTP API |
| Browser tests | `make e2e` | The ask flow, the landing story, the 3D scene and its fallback, both themes, accessibility (axe, WCAG 2.1 AA) and responsive layouts, on desktop Chrome and a Pixel 7 |
| Lint and types | `make lint` | ruff, mypy, TypeScript and ESLint |
| Retrieval evaluation | `make eval` | 190 labelled questions in English, Hindi and Hinglish, 57 of them held out: hit@5, hit@8, MRR, precision@8, misses and latency |

Without a model, retrieval finds a relevant passage in the top 8 for 76% of the 70 in-scope questions on the in-memory backend (reproduced on 13 October 2026). [docs/EVALUATION.md](docs/EVALUATION.md) has the full results, the ablations and the reasons these numbers are probably optimistic. CI runs the backend checks and the web app's type check, lint and production build on every push to `main` and every pull request; the browser tests need a running API, so they run locally.

## Using BODH responsibly

- **It is not a religious authority**, not Krishna and not a guru, and its interpretations are not the only valid ones. The Gita has many traditions of commentary that BODH does not yet include.
- **AI interpretation can be wrong.** It is always labelled, and every passage it relies on is shown in full, with its source, so you can read it for yourself.
- **The translations are from 1919 and 1922**, and carry their translators' perspectives.
- **It is not a substitute for medical, mental-health, legal or financial help.** If you are struggling, in India call Tele-MANAS on 14416 (free, 24×7), or 112 in an emergency; elsewhere, [findahelpline.com](https://findahelpline.com) lists free helplines.
- **Questions are not stored** on the server or written to logs. When a model is configured, they are sent to its provider to write the answer.

How safety and privacy are handled, and what is still imperfect, is in [docs/SAFETY.md](docs/SAFETY.md).

## Status

BODH is a working application, not a production service. Known gaps:

- **Answer quality with Claude has not been evaluated**: no API key was available during development. The pipeline has run end to end with a small local model, which kept to the grounding rules but gave poor guidance. Run `make eval-answers` with a capable model before relying on the answers.
- **25 Gita verses** differ from the cross-check edition and wait for an editor's review.
- **The Upanishads have no Sanskrit yet.**
- **The Docker images** have not been built and run end to end.

## Roadmap

- Evaluate the answers with a capable model, including the safety cases, and publish the results.
- Review the 25 flagged verses against the printed pages.
- Add the Upanishads' Sanskrit, with a second translation to check against.
- Add stories from the Mahabharata and the Ramayana, and traditional commentaries such as Shankara's, as verified public-domain editions are ingested.
- Measure a reranker with `make eval`.
- Build and smoke-test the Docker images, and run the browser tests in CI.
- Optional accounts, so that reflections can follow you between devices.

## Project layout

```
backend/
  app/ingestion/    fetch → parse → cross-check → validate → build; load into Postgres
  app/retrieval/    embeddings and hybrid retrieval
  app/generation/   prompts, model providers, safety, verification, the answer pipeline
  app/api/          HTTP routes and response views
  app/evaluation/   retrieval and answer evaluation
  data/             raw sources (byte for byte), curated editorial data, processed corpus
  migrations/       SQL schema
  tests/
web/                Next.js app; the brand is defined in src/lib/brand.ts
  e2e/              Playwright tests
  scripts/          captures the README's screenshots and demo from the running app
docs/               architecture, data, API, evaluation, deployment, safety
assets/             README screenshots, the demo recording, the link-preview image
.github/            CI, Dependabot, issue and pull request templates
```

BODH was developed under the working name Scriptural Wisdom, and a few infrastructure names keep it: the Compose project (and so its Docker volumes), the database credentials and the Python package (`scriptural-wisdom-api`). Renaming them would orphan existing data, so they stay.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): components, the answer pipeline, retrieval and verification
- [API](docs/API.md): endpoints, the answer format and streaming events
- [Data](docs/DATA.md): sources, licences, provenance, ingestion, adding sources, reviewing variants
- [Evaluation](docs/EVALUATION.md): method, current numbers, ablations, embedding study
- [Deployment](docs/DEPLOYMENT.md): containers, database, configuration, operations
- [Safety and privacy](docs/SAFETY.md): crisis handling, sensitive passages, data retention
- [Web app](web/README.md): the Ask page, the scene, the brand, design rules

## Contributing

Bug reports, corrections to the texts and improvements are welcome; [CONTRIBUTING.md](CONTRIBUTING.md) explains the setup, the checks and the project's rules. Please follow the [code of conduct](CODE_OF_CONDUCT.md), and report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Licence

BODH does not have a licence yet. Until one is added, its code and editorial content are not licensed for reuse. The source texts it shows are in the public domain, and the cross-check dataset is under the Unlicense; see [docs/DATA.md](docs/DATA.md#sources-and-licences).

## Acknowledgements

The Wikisource volunteers who transcribed and proofread Annie Besant's Gita, Project Gutenberg for Swami Paramananda's Upanishads, and the [gita/gita](https://github.com/gita/gita) project for the Sanskrit used to cross-check. The type is Instrument Serif, Literata, Geist and Tiro Devanagari Sanskrit, all under the SIL Open Font License. The instrument on the landing page is after the observatories of Jaipur's Jantar Mantar.

---

BODH is built and maintained by Tanmay Tyagi ([@tanmaytyagii](https://github.com/tanmaytyagii)).
