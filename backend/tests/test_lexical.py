"""Lexical ranking: BM25 shared by both backends.

PostgreSQL used to rank by ts_rank_cd, which gives a common word as much weight
as a rare one and ignores passage length. These tests pin the properties that
made BM25 better on the dev questions (docs/EVALUATION.md), and that the two
backends rank alike.
"""

from typing import Any

import psycopg
import pytest

from app.config import get_settings
from app.storage import postgres
from app.storage.lexical import LexicalIndex
from app.storage.memory import MemoryRepository
from app.storage.postgres import PostgresRepository


def index(primary: list[str], secondary: list[str] | None = None) -> LexicalIndex:
    ids = [f"p{i}" for i in range(len(primary))]
    return LexicalIndex(ids, ["bhagavad-gita"] * len(ids), primary, secondary or [""] * len(primary))


def ids(hits: list[Any]) -> list[str]:
    return [h.id for h in hits]


def test_a_rare_word_outweighs_a_common_one() -> None:
    # "action" is in every passage; "envy" in one. ts_rank_cd ranked p0 first.
    lexical = index(
        [
            "action action action and the fruit of action",
            "the man of envy turns from action",
            "action without attachment",
            "action is better than inaction",
        ]
    )
    assert ids(lexical.search(["action", "envy"], 4))[0] == "p1"


def test_a_long_passage_does_not_win_by_length() -> None:
    lexical = index(
        [
            "wrath and desire and delusion and the senses and the mind and memory and ruin",
            "wrath",
            "nothing here",
        ]
    )
    assert ids(lexical.search(["wrath"], 3)) == ["p1", "p0"]


def test_notes_and_themes_count_less_than_the_translation() -> None:
    lexical = index(["equanimity in success and failure", "steady in pleasure and pain"], ["", "equanimity"])
    assert ids(lexical.search(["equanimity"], 2)) == ["p0", "p1"]


def test_equal_scores_keep_corpus_order_and_sources_filter() -> None:
    lexical = LexicalIndex(
        ["a", "b", "c"],
        ["katha-upanishad", "bhagavad-gita", "bhagavad-gita"],
        ["peace", "peace", "peace"],
        ["", "", ""],
    )
    assert ids(lexical.search(["peace"], 3)) == ["a", "b", "c"]
    assert ids(lexical.search(["peace"], 3, ["bhagavad-gita"])) == ["b", "c"]
    assert lexical.search(["thou", "the"], 3) == []  # stopwords alone match nothing


class FakePostgres(PostgresRepository):
    """PostgresRepository with canned query results instead of a database."""

    def __init__(self) -> None:
        super().__init__(pool=None, embedding_model="test")  # type: ignore[arg-type]
        self.version: tuple[Any, ...] = (2, "2026-10-20")
        self.texts = [("bg.1.1", "bhagavad-gita", "wrath", ""), ("bg.1.2", "bhagavad-gita", "peace", "")]
        self.builds = 0

    def _rows(self, sql: str, params: Any = None) -> list[tuple[Any, ...]]:
        if "count(*)" in sql:
            return [self.version]
        self.builds += 1
        return list(self.texts)


def test_postgres_rebuilds_its_index_when_the_corpus_is_reloaded(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = FakePostgres()
    assert ids(repo.lexical_search(["wrath"], 5)) == ["bg.1.1"]
    assert ids(repo.lexical_search(["peace"], 5)) == ["bg.1.2"]
    assert repo.builds == 1  # built once, then reused

    repo.texts = [("bg.1.1", "bhagavad-gita", "peace", ""), ("bg.1.2", "bhagavad-gita", "wrath", "")]
    repo.version = (2, "2026-10-21")  # make ingest ran in another process
    assert ids(repo.lexical_search(["wrath"], 5)) == ["bg.1.1"]  # not yet looked again
    monkeypatch.setattr(postgres, "LEXICAL_RECHECK_SECONDS", 0.0)
    assert ids(repo.lexical_search(["wrath"], 5)) == ["bg.1.2"]
    assert repo.builds == 2


@pytest.fixture(scope="module")
def database() -> PostgresRepository:
    url = get_settings().database_url
    try:
        psycopg.connect(url, connect_timeout=2).close()
    except psycopg.OperationalError:
        pytest.skip("no PostgreSQL database is running (make db)")
    from app.storage.db import create_pool

    return PostgresRepository(create_pool(url, max_size=2), get_settings().embedding_model)


def test_both_backends_rank_alike(database: PostgresRepository, repo: MemoryRepository) -> None:
    stored = {
        r[0]: (r[1], r[2])
        for r in database._rows("SELECT id, search_primary, search_secondary FROM passages")
    }
    current = {r.passage.id: (r.search_primary, r.search_secondary) for r in _rows(repo)}
    if stored != current:
        pytest.skip("the database holds another version of the corpus; run make ingest")
    for words in (
        ["anger", "wrath", "desire"],
        ["envy", "comparison"],
        ["fear", "death", "soul"],
        ["sacrifice"],
    ):
        expected = [(h.id, round(h.score, 9)) for h in repo.lexical_search(words, 30)]
        assert [(h.id, round(h.score, 9)) for h in database.lexical_search(words, 30)] == expected, words


def _rows(repo: MemoryRepository) -> list[Any]:
    from app.storage.indexing import passage_rows

    return passage_rows(repo.corpus)
