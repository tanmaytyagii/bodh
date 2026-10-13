# API

The FastAPI service listens on port 8000. Interactive documentation is generated at `/docs` (Swagger UI) and `/openapi.json`.

The browser never calls the API directly. The web app proxies an allowlist of these routes under its own `/api/` path, so `/api/ask/stream` on the web origin forwards to `/ask/stream` here.

All responses are JSON unless noted, and text is UTF-8. Errors use FastAPI's shape: `{"detail": "message"}`, or a list of field errors for validation failures.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Service status, corpus size, embedding model and model configuration |
| `POST /ask` | Answer a question in one response |
| `POST /ask/stream` | Answer a question as server-sent events, with progress |
| `GET /search?q=&limit=12&source=` | Hybrid search over the corpus, without the language model (`limit` 1–40) |
| `GET /sources` | All sources with their divisions and editions |
| `GET /sources/{source_id}` | One source |
| `GET /sources/{source_id}/chapters/{n}` | A division's passages, with previous and next |
| `GET /sources/{source_id}/passages/{chapter}/{verse}` | A passage by its place, as in the web URLs |
| `GET /passages/{id}?context=2` | A passage with its neighbours (`context` 0–5), related passages, themes and stories |
| `GET /concepts`, `GET /concepts/{id}` | The editorial theme index, and one theme with its passages |
| `GET /stories`, `GET /stories/{id}` | Story records, and one story with its excerpts and related passages |
| `POST /feedback` | Report a problem or mark an answer helpful |

`/ask`, `/ask/stream` and `/feedback` are rate-limited per client: 20 a minute by default (`ASK_RATE_LIMIT_PER_MINUTE`). Over the limit, the API returns `429` with a `Retry-After` header.

## Health

```json
{
  "status": "ok",
  "version": "0.1.0",
  "storage": {"backend": "postgres", "passages": 872, "embedded": 872, "concepts": 36, "stories": 1},
  "embedding_model": "intfloat/multilingual-e5-small",
  "llm": {
    "provider": "anthropic",
    "configured": false,
    "model": "claude-opus-5-5",
    "detail": "No Anthropic credentials found. Set ANTHROPIC_API_KEY (or LLM_API_KEY) in .env, or choose another provider with LLM_PROVIDER."
  }
}
```

## Asking

### Request

```json
{
  "question": "I keep comparing myself with my friends and feel jealous.",
  "history": [
    {"role": "user", "content": "…"},
    {"role": "assistant", "content": "…", "passage_ids": ["bg.2.47", "bg.6.5"]}
  ]
}
```

- `question`: 1–4000 characters, not blank.
- `history`: optional, at most 40 turns, of which the last 8 are used.
  - An assistant turn's `passage_ids` (up to 16) lets a follow-up question refer back to the passages already shown; they are retrieved again and kept citable.
  - The server keeps no conversation state, so the client sends the history each time.

### Answer

`POST /ask` returns one `AnswerView`. `kind` says which parts are filled:

| `kind` | When | Main fields |
| --- | --- | --- |
| `guidance` | A life situation with relevant passages | `situation` (A); `teachings` (B–D), each with `passage`, `what_it_says`, `context`, `interpretation_notes`, `why_it_applies`, `application` and `limits`; `path_forward_intro` and `steps` (E); `reflective_question` (F); `suggested_follow_ups` (G); `related`; `evidence`; `alternative_readings` |
| `follow_up` | Continuing a conversation | Same as `guidance`. `message` carries the direct reply. |
| `clarification` | A very short first message that needs more detail | `message` (the question back), `situation` |
| `insufficient_sources` | The texts do not address the question | `message`, `steps`, `evidence_note` |
| `out_of_scope` | Not a life or scripture question | `message` |
| `crisis` | A risk to life or safety was detected | `message` and `safety.resources`; no scripture |
| `retrieval_only` | No model configured, or the model failed | `passages`, `evidence`, and `notice` explaining why there is no guidance |

Fields on every answer:

- `id`, `language` (`en`, `hi`, `hinglish` or `other`) and `timings_ms`.
- `passages`: everything retrieved, as `PassageView` (below).
- `retrieval`: the queries used, the matched themes, the evidence level and the passage ids.
- `safety`: present for `concern` and `crisis`, with `level`, `message` and `resources` (name, contact, detail, url).
- `verification`: for generated answers. `checked`, the `issues` the verifier fixed, and the `cited_ids`.
- `references`: for each cited id, `ref`, `short_ref` and `path`, for turning `[[bg.2.47]]` markers in the text into links.
- `generated_by`: provider and model, or `null` when nothing was generated.
- `evidence`: `strong`, `moderate` or `limited`.

Model-written text can contain inline citation markers like `[[bg.2.47]]`. Each one names a passage in `passages`, or in `references` when the passage was cited in an earlier turn. Render them as links, or strip them.

### Streaming

`POST /ask/stream` takes the same body and returns `text/event-stream`:

```
event: status
data: {"stage": "understanding"}

event: understanding
data: {"language": "en", "request_type": "life_situation", "summary": "…"}

event: status
data: {"stage": "retrieving"}

event: passages
data: {"passages": [PassageView, …], "retrieval": {"queries": […], "concepts": [{"id": "comparison-and-envy", "name": "Envy, comparison and goodwill", "via": "semantic"}], "evidence": "moderate", "passage_ids": ["bg.4.22", …]}}

event: status
data: {"stage": "writing"}

event: answer
data: AnswerView

event: done
data: {}
```

- Without a model, only `status` (`retrieving`), `passages`, `answer` and `done` are sent.
- A crisis message gets `answer` and `done` immediately.
- If a model call fails, an `error` event (`{"code": "llm_unavailable", "message": "…"}`) comes before a `retrieval_only` answer.
- The error codes are `llm_not_configured`, `llm_unavailable`, `llm_request_rejected`, `llm_refused`, `llm_bad_output` and `internal_error`.

`done` is always the last event.

## Passages

A `PassageView` contains:

| Field | Content |
| --- | --- |
| `id`, `ref`, `short_ref`, `path` | `bg.2.47`, "Bhagavad Gita 2.47", "BG 2.47", `/scripture/bhagavad-gita/2/47` |
| `source_id`, `source_title`, `chapter`, `verse`, `chapter_title`, `chapter_title_original` | Where it sits |
| `speaker`, `speakers` | Who speaks (all speakers if it changes mid-verse) |
| `sanskrit`, `transliteration`, `transliteration_note` | `null` for translation-only sources |
| `translation`, `translator` | The text and who translated it |
| `citation` | `label` (edition, division, verse and page), `url` (the transcription), `scan_url` (the printed page, where available), `page` |
| `provenance` | `status` (`verified`, `reviewed`, `needs_review` or `unverified`), `label`, `notes`, `cross_checks` |
| `translator_notes` | The translator's own notes, with their anchor words |
| `corrections` | Every difference from the printed edition, with its basis |
| `context_notes` | Editorial context notes for passages that are easily misread |
| `concepts` | Linked editorial themes (`id`, `name`) |

`GET /passages/{id}` also returns:

- `before` and `after`: neighbouring passages;
- `related`: up to 4 passages from the same themes, then up to 3 that are similar in meaning, each with a `reason` and a `kind` (`theme` or `similar`);
- `concepts`;
- `stories`: the stories this passage appears in.

## Feedback

```json
POST /feedback
{
  "kind": "incorrect_citation",
  "passage_id": "bg.2.47",
  "answer_id": "5d78d8b0…",
  "comment": "The scan link opens the wrong page.",
  "include_question": false,
  "question": null
}
```

- `kind` is one of `incorrect_citation`, `irrelevant_passage`, `inaccurate_interpretation`, `unhelpful_advice`, `safety_concern`, `helpful` or `other`.
- `comment` is up to 2000 characters.
- The question is stored only when `include_question` is `true`.

The API responds `201` with `{"id": 1, "message": "Thank you - your report was recorded."}`, or `422` for an unknown `passage_id`.

## Errors

| Status | When |
| --- | --- |
| `404` | Unknown source, chapter, passage, theme or story |
| `422` | Invalid body or parameters, such as a blank question, an over-long field or an unknown feedback kind |
| `429` | Rate limit exceeded. See `Retry-After`. |
| `503` | (Web proxy only) The API is unreachable |

A missing or invalid model credential never causes an error status. `/ask` still answers, with `kind: "retrieval_only"` and a `notice`.
