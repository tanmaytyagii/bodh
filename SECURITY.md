# Security policy

BODH is maintained by one person, so there is no security team. Reports are read and taken seriously.

## Reporting a vulnerability

Please don't describe it in a public issue. If the repository's **Security** tab offers **Report a vulnerability**, use that form: the report stays private. If it doesn't, open an issue with the bug report form that only asks for a private way to send a report, without any details, and the maintainer will reply with one.

Include what you found, where (a route or an endpoint), how to reproduce it, and what it would allow.

Only the latest commit on `main` is supported.

## What is worth reporting

The things that matter most in BODH:

- **Grounding.** A way to make an answer show text as scripture that is not in the corpus, or cite a passage that was not retrieved for the question, past the verifier ([backend/app/generation/verify.py](backend/app/generation/verify.py)).
- **Safety.** A way past the crisis handling, so that a message showing risk receives scripture instead of helplines ([docs/SAFETY.md](docs/SAFETY.md)).
- **Privacy.** A way for questions to be stored, logged, or exposed to anyone but the model provider ([docs/SAFETY.md](docs/SAFETY.md#privacy-and-data-retention)).
- **The web app's API proxy.** A way to reach an API route outside its allowlist ([web/src/app/api/[...path]/route.ts](web/src/app/api/%5B...path%5D/route.ts)).

## Known and documented

These are part of the design, and documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):

- The API has no authentication of its own. It is meant to be reachable only through the web app.
- The rate limiter lives in each API process's memory.
- With `TRUST_FORWARDED_FOR=true`, rate limiting is only as reliable as the proxy that sets `X-Forwarded-For`.

## Secrets

Model and embedding keys belong in `.env` (ignored by Git) or a secret manager, never in the repository or an image. `.env.example` holds placeholders only.
