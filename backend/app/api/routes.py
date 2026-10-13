"""HTTP routes."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import __version__
from app.api.container import Container
from app.api.ratelimit import RateLimiter, client_key
from app.api.views import (
    ConceptView,
    DivisionView,
    PassageView,
    SourceView,
    StoryView,
    concept_view,
    passage_view,
    source_view,
    story_view,
)
from app.corpus import Passage
from app.generation.service import AnswerView, AskRequest
from app.storage.repository import FeedbackKind, FeedbackRecord

router = APIRouter()


def container(request: Request) -> Container:
    return request.app.state.container


Services = Annotated[Container, Depends(container)]


def rate_limited(request: Request) -> None:
    limiter: RateLimiter = request.app.state.ask_limiter
    trust = request.app.state.container.settings.trust_forwarded_for
    limiter.check(client_key(request, trust_forwarded_for=trust))


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------


@router.get("/health")
def health(c: Services) -> dict[str, Any]:
    status = c.llm_status
    return {
        "status": "ok",
        "version": __version__,
        "storage": c.repo.stats(),
        "embedding_model": c.embedder.model_id,
        "llm": {
            "provider": status.provider,
            "configured": status.configured,
            "model": status.model,
            "detail": status.detail,
        },
    }


# --------------------------------------------------------------------------
# Ask
# --------------------------------------------------------------------------


@router.post("/ask", response_model=AnswerView, dependencies=[Depends(rate_limited)])
def ask(body: AskRequest, c: Services) -> AnswerView:
    """Answer a question in one response (no progress events)."""
    return c.guidance.ask(body)


@router.post("/ask/stream", dependencies=[Depends(rate_limited)])
def ask_stream(body: AskRequest, c: Services) -> StreamingResponse:
    """Server-sent events: `status`, `understanding`, `passages`, `answer`, `error`, `done`."""

    def events() -> Iterator[str]:
        try:
            for event in c.guidance.stream(body):
                yield _sse(event.type, event.data)
        except Exception:
            yield _sse("error", {"code": "internal_error", "message": "Something went wrong."})
            raise
        finally:
            yield _sse("done", {})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# --------------------------------------------------------------------------
# Scripture explorer
# --------------------------------------------------------------------------


@router.get("/sources", response_model=list[SourceView])
def list_sources(c: Services) -> list[SourceView]:
    editions = c.repo.list_editions()
    return [source_view(s, editions) for s in c.repo.list_sources()]


@router.get("/sources/{source_id}", response_model=SourceView)
def get_source(source_id: str, c: Services) -> SourceView:
    source = c.repo.get_source(source_id)
    if source is None:
        raise HTTPException(404, f"No source {source_id!r}.")
    return source_view(source, c.repo.list_editions())


class ChapterView(BaseModel):
    source: SourceView
    chapter: DivisionView
    passages: list[PassageView]
    previous: int | str | None
    next: int | str | None


@router.get("/sources/{source_id}/chapters/{chapter}", response_model=ChapterView)
def get_chapter(source_id: str, chapter: str, c: Services) -> ChapterView:
    source = c.repo.get_source(source_id)
    if source is None:
        raise HTTPException(404, f"No source {source_id!r}.")
    numbers = [str(d.number) for d in source.divisions]
    if chapter not in numbers:
        raise HTTPException(404, f"{source.title} has no {source.division_label.lower()} {chapter}.")
    index = numbers.index(chapter)
    division = source.divisions[index]
    passages = c.repo.division_passages(source_id, chapter)
    return ChapterView(
        source=source_view(source, c.repo.list_editions()),
        chapter=DivisionView(
            number=division.number,
            title=division.title,
            title_original=division.title_original,
            passage_count=division.passage_count,
        ),
        passages=[passage_view(p, c.lookup) for p in passages],
        previous=source.divisions[index - 1].number if index > 0 else None,
        next=source.divisions[index + 1].number if index + 1 < len(numbers) else None,
    )


class RelatedPassage(BaseModel):
    passage: PassageView
    reason: str
    kind: Literal["theme", "similar"]


class StoryRef(BaseModel):
    id: str
    title: str


class PassageDetail(BaseModel):
    passage: PassageView
    before: list[PassageView]
    after: list[PassageView]
    related: list[RelatedPassage]
    concepts: list[ConceptView]
    stories: list[StoryRef]


@router.get("/passages/{passage_id}", response_model=PassageDetail)
def get_passage(passage_id: str, c: Services, context: int = Query(2, ge=0, le=5)) -> PassageDetail:
    passage = c.repo.get_passage(passage_id)
    if passage is None:
        raise HTTPException(404, f"No passage {passage_id!r}.")
    return _passage_detail(passage, c, context)


@router.get("/sources/{source_id}/passages/{chapter}/{verse}", response_model=PassageDetail)
def get_passage_by_location(
    source_id: str, chapter: str, verse: str, c: Services, context: int = Query(2, ge=0, le=5)
) -> PassageDetail:
    """Resolve a passage from its place in a source (as in the web app's URLs)."""
    passage = c.repo.get_passage_by_path(source_id, f"{chapter}/{verse}")
    if passage is None:
        raise HTTPException(404, f"No passage {chapter}.{verse} in {source_id!r}.")
    return _passage_detail(passage, c, context)


def _passage_detail(passage: Passage, c: Container, context: int) -> PassageDetail:
    passage_id = passage.id
    before, after = c.repo.neighbors(passage_id, context, context)
    concepts = [c.repo.get_concept(cid) for cid in passage.metadata.get("concepts", [])]
    nearby = {p.id for p in before + after} | {passage.id}

    related: list[RelatedPassage] = []
    seen = set(nearby)
    for concept in concepts:
        if concept is None:
            continue
        for pid in concept.passage_ids:
            if pid in seen:
                continue
            other = c.repo.get_passage(pid)
            if other is not None:
                seen.add(pid)
                related.append(
                    RelatedPassage(
                        passage=passage_view(other, c.lookup),
                        reason=f"Also linked to the theme “{concept.name}” in the editorial index.",
                        kind="theme",
                    )
                )
            if sum(1 for r in related if r.kind == "theme") >= 4:
                break
    for hit in c.repo.similar_passages(passage_id, 8):
        if hit.id in seen:
            continue
        other = c.repo.get_passage(hit.id)
        if other is None:
            continue
        seen.add(hit.id)
        related.append(
            RelatedPassage(
                passage=passage_view(other, c.lookup),
                reason="Close in meaning, by semantic similarity of the translations.",
                kind="similar",
            )
        )
        if sum(1 for r in related if r.kind == "similar") >= 3:
            break

    return PassageDetail(
        passage=passage_view(passage, c.lookup),
        before=[passage_view(p, c.lookup) for p in before],
        after=[passage_view(p, c.lookup) for p in after],
        related=related,
        concepts=[concept_view(x, c.lookup) for x in concepts if x is not None],
        stories=[
            StoryRef(id=s.id, title=s.title) for s in c.repo.list_stories() if passage_id in s.excerpt_ids
        ],
    )


class SearchHit(BaseModel):
    passage: PassageView
    score: float
    channels: dict[str, int]


class SearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
    concepts: list[dict[str, str]]
    evidence: str


@router.get("/search", response_model=SearchResponse)
def search(
    c: Services,
    q: str = Query(..., min_length=1, max_length=500),
    limit: int = Query(12, ge=1, le=40),
    source: str | None = None,
) -> SearchResponse:
    """Hybrid search over the corpus, without the language model."""
    result = c.retriever.retrieve(
        question=q.strip(), top_k=limit, source_ids=[source] if source else None, context_window=0
    )
    return SearchResponse(
        query=q,
        results=[
            SearchHit(passage=passage_view(i.passage, c.lookup), score=i.score, channels=i.channels)
            for i in result.passages
        ],
        concepts=[{"id": m.concept.id, "name": m.concept.name, "via": m.via} for m in result.concepts],
        evidence=result.evidence,
    )


@router.get("/concepts", response_model=list[ConceptView])
def list_concepts(c: Services) -> list[ConceptView]:
    return [concept_view(x, c.lookup) for x in c.repo.list_concepts()]


@router.get("/concepts/{concept_id}", response_model=ConceptView)
def get_concept(concept_id: str, c: Services) -> ConceptView:
    concept = c.repo.get_concept(concept_id)
    if concept is None:
        raise HTTPException(404, f"No concept {concept_id!r}.")
    return concept_view(concept, c.lookup, c.repo.get_passages(concept.passage_ids))


@router.get("/stories", response_model=list[StoryView])
def list_stories(c: Services) -> list[StoryView]:
    return [story_view(s, c.lookup, [], []) for s in c.repo.list_stories()]


@router.get("/stories/{story_id}", response_model=StoryView)
def get_story(story_id: str, c: Services) -> StoryView:
    story = c.repo.get_story(story_id)
    if story is None:
        raise HTTPException(404, f"No story {story_id!r}.")
    return story_view(
        story,
        c.lookup,
        c.repo.get_passages(story.excerpt_ids),
        c.repo.get_passages(story.related_passage_ids),
    )


# --------------------------------------------------------------------------
# Feedback
# --------------------------------------------------------------------------


class FeedbackRequest(BaseModel):
    kind: FeedbackKind
    passage_id: str | None = Field(None, max_length=64)
    answer_id: str | None = Field(None, max_length=64)
    comment: str | None = Field(None, max_length=2000)
    # The question is stored only when the person explicitly chooses to share it.
    include_question: bool = False
    question: str | None = Field(None, max_length=4000)


class FeedbackResponse(BaseModel):
    id: int
    message: str


@router.post(
    "/feedback", response_model=FeedbackResponse, status_code=201, dependencies=[Depends(rate_limited)]
)
def feedback(body: FeedbackRequest, c: Services) -> FeedbackResponse:
    if body.passage_id and c.repo.get_passage(body.passage_id) is None:
        raise HTTPException(422, f"No passage {body.passage_id!r}.")
    context = {"question": body.question} if body.include_question and body.question else None
    record_id = c.repo.add_feedback(
        FeedbackRecord(
            kind=body.kind,
            passage_id=body.passage_id,
            answer_id=body.answer_id,
            comment=(body.comment or "").strip() or None,
            context=context,
        )
    )
    return FeedbackResponse(id=record_id, message="Thank you - your report was recorded.")
