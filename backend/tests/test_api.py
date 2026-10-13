"""HTTP API, with the in-memory backend and a fake language model."""

import json

from tests.conftest import FakeLLM


def test_health_reports_configuration(make_app) -> None:  # type: ignore[no-untyped-def]
    body = make_app().get("/health").json()
    assert body["status"] == "ok"
    assert body["storage"]["passages"] == 872
    assert body["llm"]["configured"] is False and body["llm"]["detail"]


def test_explorer_endpoints(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app()
    source = client.get("/sources/bhagavad-gita").json()
    assert source["passage_count"] == 701 and len(source["divisions"]) == 18
    chapter = client.get("/sources/bhagavad-gita/chapters/2").json()
    assert len(chapter["passages"]) == 72 and chapter["previous"] == 1 and chapter["next"] == 3
    detail = client.get("/passages/bg.2.47").json()
    assert detail["passage"]["citation"]["scan_url"].endswith(".djvu/45")
    assert [p["id"] for p in detail["before"]] == ["bg.2.45", "bg.2.46"]
    assert {r["kind"] for r in detail["related"]} == {"theme", "similar"}
    assert client.get("/concepts").json()[0]["editorial"] is True
    concept = client.get("/concepts/equanimity").json()
    assert concept["passages"] and concept["passages"][0]["id"].startswith("bg.")
    # Every source names the edition its text comes from.
    for item in client.get("/sources").json():
        assert [e["role"] for e in item["editions"]].count("primary") == 1, item["id"]


def test_passage_by_location_and_stories(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app()
    detail = client.get("/sources/katha-upanishad/passages/2/1").json()
    assert detail["passage"]["id"] == "katha.2.1"
    assert detail["passage"]["short_ref"] == "Katha 1.2.1"
    assert detail["stories"] == [{"id": "nachiketas-and-death", "title": "Nachiketas and Death"}]
    assert client.get("/sources/katha-upanishad/passages/9/1").status_code == 404
    story = client.get("/stories/nachiketas-and-death").json()
    assert story["editorial"] is True and story["excerpts"][0]["id"] == "katha.1.3"


def test_search(make_app) -> None:  # type: ignore[no-untyped-def]
    body = make_app().get("/search", params={"q": "karmanye vadhikaraste", "limit": 3}).json()
    assert body["results"][0]["passage"]["id"] == "bg.2.47"


def test_not_found_and_malformed_requests(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app()
    assert client.get("/passages/bg.99.1").status_code == 404
    assert client.get("/sources/bhagavad-gita/chapters/19").status_code == 404
    assert client.post("/ask", json={"question": "   "}).status_code == 422
    assert client.post("/ask", json={}).status_code == 422
    assert (
        client.post("/ask", content=b"not json", headers={"content-type": "application/json"}).status_code
        == 422
    )
    assert client.post("/ask", json={"question": "x" * 4001}).status_code == 422
    assert client.get("/search", params={"q": ""}).status_code == 422


def test_ask_with_model(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app(llm=FakeLLM())
    answer = client.post("/ask", json={"question": "I keep failing interviews and feel jealous."}).json()
    assert answer["kind"] == "guidance"
    assert answer["teachings"] and answer["teachings"][0]["passage"]["sanskrit"]
    assert answer["verification"]["checked"] is True


def test_ask_stream_is_server_sent_events(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app(llm=FakeLLM())
    with client.stream("POST", "/ask/stream", json={"question": "I keep failing interviews."}) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())
    events = [block.split("\n") for block in raw.strip().split("\n\n")]
    names = [lines[0].removeprefix("event: ") for lines in events]
    assert names[-2:] == ["answer", "done"]
    answer = json.loads(events[-2][1].removeprefix("data: "))
    assert answer["kind"] == "guidance"


def test_rate_limit(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app(rate_limit=2)
    for _ in range(2):
        assert client.post("/ask", json={"question": "anger"}).status_code == 200
    limited = client.post("/ask", json={"question": "anger"})
    assert limited.status_code == 429 and "Retry-After" in limited.headers


def test_feedback(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app()
    ok = client.post(
        "/feedback", json={"kind": "incorrect_citation", "passage_id": "bg.2.47", "comment": "test"}
    )
    assert ok.status_code == 201
    assert client.post("/feedback", json={"kind": "nonsense"}).status_code == 422
    assert client.post("/feedback", json={"kind": "other", "passage_id": "bg.99.1"}).status_code == 422


def test_feedback_stores_question_only_with_consent(make_app) -> None:  # type: ignore[no-untyped-def]
    client = make_app()
    repo = client.app.state.container.repo
    client.post("/feedback", json={"kind": "other", "question": "private", "include_question": False})
    client.post("/feedback", json={"kind": "other", "question": "shared", "include_question": True})
    assert repo._feedback[-2]["context"] is None
    assert repo._feedback[-1]["context"] == {"question": "shared"}
