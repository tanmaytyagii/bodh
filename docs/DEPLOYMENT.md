# Deployment

Three services, each with its own image:

| Service | Image | Needs |
| --- | --- | --- |
| Database | PostgreSQL 15+ with the `vector` (pgvector) and `pg_trgm` extensions. Compose uses `pgvector/pgvector:pg17`. | Persistent storage. The data is small (872 passages). |
| API | `backend/Dockerfile`: Python 3.11, FastAPI, the embedding model on CPU | The database, and optionally model credentials |
| Web | `web/Dockerfile`: the Node 24 standalone server for Next.js | The API's URL |

Only the web app should be public. The API has no authentication of its own, and the browser reaches it only through the web app's `/api/*` proxy.

> **Status.** Both Dockerfiles pass `docker build --check`, and the Compose file validates. The images have not yet been built and run end to end; there was not enough disk space during development. Run `make up` and a smoke test before relying on them.

## Building and running

**Locally, everything in Docker:**

```bash
make up            # docker compose --profile app up --build
```

**Separate images:**

```bash
docker build -t bodh-api backend/                       # --build-arg PRELOAD_MODEL=0 to skip baking in the model
docker build -t bodh-web --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain web/
```

The API image:

- contains the processed corpus;
- downloads the embedding model at build time by default, so containers start without network access to Hugging Face;
- applies migrations and loads the corpus on start (`docker-entrypoint.sh`). The load is idempotent: it only writes what changed and re-embeds only changed text.

Set `AUTO_LOAD=0` to skip loading on start. That is the right setting for multiple replicas: run `python -m app.ingestion load` once as a release step instead, so replicas do not race.

Each API process builds its keyword-search (BM25) index from the stored text on its first search. It looks for a reloaded corpus at most every 30 seconds, so after a release-step load every replica searches the new text within 30 seconds, without a restart.

The web image reads `API_URL` at runtime, so one image works in every environment. The site's public address (`NEXT_PUBLIC_SITE_URL`) is compiled in at build time, and so is `NEXT_PUBLIC_APP_NAME` if you set it.

## Configuration

Set these as environment variables or from a secret manager. Never bake keys into images (both `.dockerignore` files exclude `.env`). Every variable is documented in [.env.example](../.env.example).

**API:**

| Variable | Production notes |
| --- | --- |
| `DATABASE_URL` | Managed Postgres works (RDS, Cloud SQL, Azure, Supabase, Neon). The first migration runs `CREATE EXTENSION vector` and `pg_trgm`; create them beforehand if the app's role cannot. |
| `LLM_PROVIDER`, `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `LLM_API_KEY`), `LLM_MODEL` | Without credentials the app runs in passages-only mode, and `/health` says why |
| `LLM_FAST_MODEL`, `LLM_UNDERSTAND_EFFORT`, `LLM_ANSWER_EFFORT` | Latency and cost controls (see below) |
| `ASK_RATE_LIMIT_PER_MINUTE` | Per client, per API process |
| `TRUST_FORWARDED_FOR` | See "Client addresses" below |
| `CORS_ORIGINS` | Only matters if browsers call the API directly, which the web app does not need |
| `LOG_LEVEL` | `INFO` logs one line per answer |
| `AUTO_LOAD` | `1` (default) loads the corpus on start |

**Web:**

| Variable | When it is read | Purpose |
| --- | --- | --- |
| `API_URL` | Runtime | The API as seen from the web server, for example `http://api:8000` |
| `NEXT_PUBLIC_SITE_URL` | Build time | The public address, e.g. `https://your-domain`. Link previews need it for an absolute image URL, and pages get canonical links from it; without it, previews point at localhost, there are no canonical links, and the build warns. |
| `NEXT_PUBLIC_APP_NAME` | Build time | Optional. Replaces the product name (BODH) alone; the rest of the brand is in `web/src/lib/brand.ts`. |

## Reverse proxy and networking

- **TLS** terminates at your load balancer or reverse proxy, in front of the web app.
- **Streaming.**
  - Answers stream as server-sent events from `/api/ask/stream`. The web app already sends `X-Accel-Buffering: no` and `Cache-Control: no-transform`; if your proxy ignores those, turn buffering off for that path (`proxy_buffering off` in nginx).
  - Allow at least 180 s of read time on that path. A full answer takes two model calls, and `LLM_TIMEOUT_SECONDS` defaults to 180.
- **Client addresses and rate limiting.**
  - The web proxy forwards the first `X-Forwarded-For` address it receives. The API uses that address for rate limiting when `TRUST_FORWARDED_FOR=true`, as in Compose.
  - This is safe only if the proxy in front of the web app overwrites `X-Forwarded-For` with the real client address (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`). Otherwise a client can send its own header and rotate addresses to evade the limit.
  - If you cannot guarantee that, set `TRUST_FORWARDED_FOR=false`. All traffic then shares the web server's bucket, so raise the limit and rate-limit at the edge.
  - The limiter is in memory per API process, so N replicas allow N times the limit.
- **Keep the API private.**
  - Compose publishes it on `127.0.0.1` only.
  - The interactive docs at `/docs` are harmless, but there is no reason to expose them.

## Cost and latency

- **Model calls.** Each question makes two model calls: understanding (effort `low`) and the answer (effort `medium`). Both default to `claude-opus-5-5`.
  - To trade quality for speed and cost, set `LLM_FAST_MODEL=claude-haiku-5-5` for the understanding step, or lower `LLM_ANSWER_EFFORT`.
  - Measure any change with `make eval-answers` first.
- **Prompt caching.** The long system prompts are marked for caching, so repeated questions pay less for them.
- **Unchanged costs.** Crisis messages, out-of-scope questions and the explorer make no answer-generation calls. Search and browsing never call a model.
- **Retrieval** takes about 20 ms on PostgreSQL. The embedding model runs on CPU inside the API process; the development API used about 110 MB of resident memory after warm-up. Measure in your own environment.

## Operations

- **Health.** `GET /health` on the API reports storage counts, the embedding model and whether the model provider is configured. It is suitable for readiness checks. The web app has no separate health route; probe `/`.
- **Logs.**
  - The API logs one line per answer: id, kind, evidence, safety level and timings. It never logs the question.
  - Model failures are logged as warnings with their error code.
  - The API image runs without the uvicorn access log, because URLs such as `/search?q=…` contain what people typed. If you re-enable it, or your proxy logs full URLs, treat those logs as personal data.
- **Feedback.** Reports are stored in the `feedback` table. Review them regularly:

  ```sql
  SELECT created_at, kind, passage_id, comment FROM feedback ORDER BY created_at DESC LIMIT 50;
  ```

  `incorrect_citation` and `safety_concern` reports need prompt attention. `context.question` is present only when the person chose to share it.
- **Backups.** Only `feedback` holds data that cannot be rebuilt; everything else comes from `backend/data/processed`. Back up the database, or at least that table.
- **Updating content.** Edit the curated YAML or `reviews.yaml`, run `make corpus`, commit `backend/data/processed`, and deploy. The entrypoint loads the changes on start.

## Before launch

- [ ] Build and run the images (`make up`) and click through Ask, Explore, a verse page and a story.
- [ ] Configure model credentials. Check that `/health` shows `llm.configured: true`, run `make eval-answers`, and read a sample of the answers, including the safety cases.
- [ ] Re-verify the helpline numbers in `backend/app/generation/safety.py`; see [SAFETY.md](SAFETY.md).
- [ ] Build the web image with `NEXT_PUBLIC_SITE_URL` set to the public address, and check a link preview (the `og:image` URL must be absolute and load).
- [ ] Reverse proxy: TLS, `X-Forwarded-For` overwritten, no buffering and a long timeout for `/api/ask/stream`.
- [ ] Publish a privacy notice that matches [SAFETY.md](SAFETY.md#privacy-and-data-retention): what feedback stores, what is logged, and that reflections stay in the browser.
- [ ] If you will re-fetch sources, set `INGEST_USER_AGENT` to identify your deployment with a contact URL.
