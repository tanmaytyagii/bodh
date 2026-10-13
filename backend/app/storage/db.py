"""PostgreSQL connections and migrations."""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

from app.config import BACKEND_DIR

log = logging.getLogger(__name__)

MIGRATIONS_DIR = BACKEND_DIR / "migrations"


class DatabaseUnavailable(RuntimeError):
    pass


def migrate(database_url: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending `NNN_*.sql` migrations in order. Returns those applied."""
    applied: list[str] = []
    try:
        conn = psycopg.connect(database_url, autocommit=False)
    except psycopg.OperationalError as exc:
        raise DatabaseUnavailable(_unavailable_message(database_url, exc)) from exc
    with conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        for path in sorted(directory.glob("*.sql")):
            if path.stem in done:
                continue
            log.info("Applying migration %s", path.name)
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,))
            applied.append(path.stem)
        conn.commit()
    return applied


def create_pool(database_url: str, *, min_size: int = 1, max_size: int = 10) -> ConnectionPool:
    pool = ConnectionPool(
        database_url,
        min_size=min_size,
        max_size=max_size,
        configure=register_vector,
        open=False,
    )
    try:
        pool.open(wait=True, timeout=10)
    except Exception as exc:
        pool.close()
        raise DatabaseUnavailable(_unavailable_message(database_url, exc)) from exc
    return pool


def _unavailable_message(database_url: str, exc: Exception) -> str:
    host = database_url.split("@")[-1]
    return (
        f"Cannot connect to PostgreSQL at {host}: {exc}. Start it with "
        "`docker compose up -d db` and run `python -m app.ingestion load`, or set "
        "RETRIEVAL_BACKEND=memory to run without a database."
    )
