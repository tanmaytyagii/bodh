#!/bin/sh
# Apply migrations and load the corpus before serving. The load is idempotent:
# unchanged passages are skipped and only changed text is re-embedded.
set -e

if [ "${RETRIEVAL_BACKEND:-postgres}" = "postgres" ] && [ "${AUTO_LOAD:-1}" = "1" ]; then
  python -m app.ingestion load
fi

exec "$@"
