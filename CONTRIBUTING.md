# Contributing to BODH

Thank you for helping. BODH puts verified passages from the Bhagavad Gita and the Upanishads beside real-life questions, so every change is judged first by two things: the text stays exact and attributed, and interpretation stays honest about what it is.

> **No licence yet.** BODH has not chosen a licence, so its code is not yet open for reuse, and a contribution would have no clear terms. Until there is one, please open an issue before starting anything substantial.

## Ways to help

- **Report a problem** with the issue forms: a bug, or a passage, translation or citation that looks wrong.
- **Review a flagged verse.** 25 verses of the Gita differ from the cross-check edition and wait for an editor's decision. The process is in [docs/DATA.md](docs/DATA.md#reviewing-flagged-verses).
- **Improve the documentation, the tests or the accessibility.**
- **Add a source.** New texts must be public domain or openly licensed, from an edition that can be cited page by page. See [docs/DATA.md](docs/DATA.md#adding-a-source).

## Setting up

You need Python 3.11, Node.js 20.9 or newer (CI uses Node 24), and, optionally, Docker for PostgreSQL.

```bash
git clone https://github.com/tanmaytyagii/bodh.git && cd bodh
cp .env.example .env    # optional: a model key enables AI guidance
make setup              # Python virtualenv and npm install
make ingest             # PostgreSQL + pgvector in Docker, corpus and embeddings
make api                # FastAPI on http://localhost:8000
make web                # Next.js on http://localhost:3000, in a second terminal
```

Without Docker, set `RETRIEVAL_BACKEND=memory` in `.env` and skip `make ingest`. Without a model key, answers are verified passages only, clearly marked; set `LLM_PROVIDER=none` to make that explicit.

`make setup` needs a working `python3.11` on your `PATH` (from python.org, pyenv, uv or Homebrew).

## Commands

| Command | What it does |
| --- | --- |
| `make lint` | ruff, ruff format, mypy; the TypeScript check and ESLint |
| `make test` | Backend tests. No Docker or model key needed; the first run downloads the embedding model (about 130 MB). |
| `make e2e` | Playwright tests on desktop Chrome and a Pixel 7, with axe accessibility checks in both themes. Start `make api` first, and install the browser once with `cd web && npx playwright install chromium`. |
| `make eval` | Retrieval evaluation on the labelled questions |
| `make corpus` | Rebuild `backend/data/processed` from the sources, with validation |

`make help` lists the rest. The web app's own checks are in [web/README.md](web/README.md#checks).

## Before you open a pull request

- Run `make lint` and `make test`. For changes to the web app, run `make e2e` too, with the API started as `LLM_PROVIDER=none make api` so no model is called.
- For visible changes, check both themes and a phone-width screen, and add screenshots to the pull request.
- Keep a pull request to one change. Branch from `main`, and write commit subjects in the imperative ("Add the Kena Upanishad Sanskrit").

CI runs the backend checks and the web app's type check, lint and production build on every pull request. The browser tests need a running API, so they run locally.

## Project rules

These hold everywhere, and reviews check them:

- **Scripture comes only from the corpus.** Never type a verse, Sanskrit or a translation into the interface or a prompt. The model returns passage ids, and the app shows the stored text.
- **Every kind of content keeps its label.** Source text, translator's notes, editorial material and AI interpretation look different everywhere ([web/src/components/Label.tsx](web/src/components/Label.tsx)).
- **Nothing is cited that was not retrieved.** Don't weaken the verifier ([backend/app/generation/verify.py](backend/app/generation/verify.py)).
- **Safety comes first.** Changes to crisis detection, sensitivity notes or helplines need tests, and a reason ([docs/SAFETY.md](docs/SAFETY.md)).
- **Questions are private.** Never log or store what people ask.
- **Every page stays accessible**: axe checks in both themes, keyboard access, reduced motion respected, no horizontal scrolling at phone width.
- **Downloaded sources stay byte for byte.** Files under `backend/data/raw/` must match the checksums in their manifests; `.gitattributes` and `.editorconfig` keep Git and editors from changing them.
- **The brand lives in one file**, [web/src/lib/brand.ts](web/src/lib/brand.ts).

## Dependencies

- **Web:** Dependabot proposes npm updates weekly. `three` stays at 0.182 until @react-three/fiber stops using `THREE.Clock` ([web/README.md](web/README.md#the-scene)).
- **Backend:** the ranges are in `backend/pyproject.toml` and the exact versions in `backend/constraints.txt`. Change both together, then run `make setup`, `make lint` and `make test`.

## Reporting a vulnerability

Please don't describe it in a public issue. [SECURITY.md](SECURITY.md) says how to report it privately.

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
