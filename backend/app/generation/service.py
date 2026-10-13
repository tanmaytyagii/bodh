"""The question → guidance workflow.

    safety check → understand → retrieve → generate → verify → respond

Produces a sequence of events so the HTTP layer can stream progress
(`status`, `understanding`, `passages`, `answer`, `error`). Nothing about the
person's question is logged or stored: the conversation lives in the client,
which sends the relevant history with each follow-up.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.api.views import Lookup, PassageView, passage_view
from app.config import Settings
from app.corpus import Passage
from app.generation import prompts, safety
from app.generation.llm import (
    LLMBadOutput,
    LLMClient,
    LLMError,
    LLMStatus,
    step_config,
)
from app.generation.schemas import GuidanceDraft, Understanding
from app.generation.verify import Verifier
from app.retrieval.hybrid import HybridRetriever, RetrievalResult
from app.storage.repository import Repository

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Request and response models
# --------------------------------------------------------------------------


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)
    passage_ids: list[str] = Field(default_factory=list, max_length=16)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=40)

    @field_validator("question")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class TeachingView(BaseModel):
    passage: PassageView
    what_it_says: str
    context: str
    interpretation_notes: str | None
    why_it_applies: str
    application: str
    limits: str


class StepView(BaseModel):
    title: str
    detail: str
    timeframe: str


class RelatedView(BaseModel):
    passage: PassageView
    reason: str


class SafetyView(BaseModel):
    level: Literal["concern", "crisis"]
    message: str | None
    resources: list[safety.Resource]


class VerificationView(BaseModel):
    checked: bool
    issues: list[str]
    cited_ids: list[str]


class GeneratedBy(BaseModel):
    provider: str
    model: str


class ReferenceView(BaseModel):
    """Where a cited passage lives, for rendering [[id]] markers as links."""

    id: str
    ref: str
    short_ref: str
    path: str


class ConceptMatchView(BaseModel):
    id: str
    name: str
    via: str


class RetrievalView(BaseModel):
    queries: list[str]
    concepts: list[ConceptMatchView]
    evidence: str
    passage_ids: list[str]


AnswerKind = Literal[
    "guidance",
    "follow_up",
    "clarification",
    "insufficient_sources",
    "out_of_scope",
    "crisis",
    "retrieval_only",
]


class AnswerView(BaseModel):
    id: str
    kind: AnswerKind
    language: str
    situation: str | None = None
    teachings: list[TeachingView] = Field(default_factory=list)
    path_forward_intro: str | None = None
    steps: list[StepView] = Field(default_factory=list)
    framework: str | None = None
    reflective_question: str | None = None
    message: str | None = None
    related: list[RelatedView] = Field(default_factory=list)
    passages: list[PassageView] = Field(default_factory=list)
    evidence: Literal["strong", "moderate", "limited"] | None = None
    evidence_note: str | None = None
    alternative_readings: str | None = None
    suggested_follow_ups: list[str] = Field(default_factory=list)
    safety: SafetyView | None = None
    verification: VerificationView | None = None
    references: list[ReferenceView] = Field(default_factory=list)
    generated_by: GeneratedBy | None = None
    retrieval: RetrievalView | None = None
    notice: str | None = None
    timings_ms: dict[str, float] = Field(default_factory=dict)


@dataclass
class Event:
    type: Literal["status", "understanding", "passages", "answer", "error"]
    data: dict[str, Any]


OUT_OF_SCOPE: dict[str, str] = {
    "en": (
        "This space is for reflecting on life situations with the help of the Bhagavad Gita "
        "and related texts. Your question seems to be about something else, so it won't be "
        "forced into a scriptural answer. If there is a personal situation behind it, describe "
        "it and we can look at what the texts offer."
    ),
    "hi": (
        "यह जगह जीवन की परिस्थितियों पर भगवद्गीता और संबंधित ग्रंथों की मदद से विचार करने के लिए "
        "है। आपका प्रश्न किसी और विषय से जुड़ा लगता है, इसलिए उस पर ज़बरदस्ती कोई शास्त्रीय उत्तर "
        "नहीं दिया जाएगा। अगर इसके पीछे कोई व्यक्तिगत परिस्थिति है, तो उसके बारे में बताइए।"
    ),
    "hinglish": (
        "Yeh jagah zindagi ki situations par Bhagavad Gita aur related granthon ki madad se "
        "sochne ke liye hai. Aapka sawaal kisi aur vishay ka lagta hai, isliye uska zabardasti "
        "koi scriptural jawab nahi diya jayega. Agar iske peeche koi personal situation hai, "
        "toh uske baare mein bataiye."
    ),
}


# --------------------------------------------------------------------------
# Service
# --------------------------------------------------------------------------


class GuidanceService:
    def __init__(
        self,
        *,
        repo: Repository,
        retriever: HybridRetriever,
        llm: LLMClient | None,
        llm_status: LLMStatus,
        settings: Settings,
    ) -> None:
        self.repo = repo
        self.retriever = retriever
        self.llm = llm
        self.llm_status = llm_status
        self.settings = settings
        concepts = repo.list_concepts()
        self.concepts = {c.id: c for c in concepts}
        self.lookup = Lookup(repo.list_sources(), repo.list_editions(), concepts)
        self.understand_system = prompts.understand_system(concepts)
        self.translators = prompts.translator_labels(repo.list_editions())

    # -- public API ----------------------------------------------------------

    def ask(self, request: AskRequest) -> AnswerView:
        answer: AnswerView | None = None
        for event in self.stream(request):
            if event.type == "answer":
                answer = AnswerView.model_validate(event.data)
        assert answer is not None
        return answer

    def stream(self, request: AskRequest) -> Iterator[Event]:
        started = time.perf_counter()
        timings: dict[str, float] = {}
        answer_id = uuid.uuid4().hex
        question = request.question.strip()
        history = [
            {"role": t.role, "content": t.content}
            for t in request.history[-self.settings.max_history_turns :]
        ]
        pinned_ids = _recent_citations(request.history)
        language: str = safety.guess_language(question)
        signal = safety.detect(question)

        def done(answer: AnswerView) -> Event:
            answer.timings_ms = {**timings, "total": _ms(started)}
            log.info(
                "answer %s kind=%s evidence=%s safety=%s %s",
                answer.id,
                answer.kind,
                answer.evidence,
                signal.level,
                answer.timings_ms,
            )
            return Event("answer", answer.model_dump(mode="json"))

        if signal.level == "crisis":
            yield done(self._crisis_answer(answer_id, language, signal))
            return

        if self.llm is None:
            yield from self._retrieval_only(
                answer_id,
                question,
                language,
                pinned_ids,
                timings,
                done,
                notice=self._not_configured_notice(),
            )
            return

        # 1. Understand ------------------------------------------------------
        yield Event("status", {"stage": "understanding"})
        t0 = time.perf_counter()
        try:
            understanding = self._call(
                self.understand_system,
                prompts.understand_user(question, history),
                Understanding,
                "understand",
            )
        except LLMError as exc:
            log.warning("understanding failed: %s (%s)", exc.code, exc)
            yield Event("error", {"code": exc.code, "message": str(exc)})
            yield from self._retrieval_only(
                answer_id,
                question,
                language,
                pinned_ids,
                timings,
                done,
                notice=f"AI guidance is unavailable right now ({exc}).",
            )
            return
        timings["understand"] = _ms(t0)
        language = _reconcile_language(understanding.language, language)
        signal.raise_to(*_model_safety(understanding))
        yield Event(
            "understanding",
            {
                "language": language,
                "request_type": understanding.request_type,
                "summary": understanding.situation_summary,
            },
        )

        if signal.level == "crisis":
            yield done(self._crisis_answer(answer_id, language, signal))
            return
        if understanding.request_type == "out_of_scope":
            yield done(
                AnswerView(
                    id=answer_id,
                    kind="out_of_scope",
                    language=language,
                    message=OUT_OF_SCOPE.get(language, OUT_OF_SCOPE["en"]),
                    generated_by=None,
                )
            )
            return
        # A clarification-only reply is for genuinely underspecified first
        # messages ("what should I do?"); anything longer gets a full answer,
        # in which the model can still ask for what it needs.
        if understanding.clarifying_question and not history and len(question.split()) < SHORT_QUESTION_WORDS:
            yield done(
                AnswerView(
                    id=answer_id,
                    kind="clarification",
                    language=language,
                    situation=understanding.situation_summary,
                    message=understanding.clarifying_question,
                    generated_by=self._generated_by("understand"),
                )
            )
            return

        # 2. Retrieve --------------------------------------------------------
        yield Event("status", {"stage": "retrieving"})
        t0 = time.perf_counter()
        result = self.retriever.retrieve(
            question=question,
            queries=understanding.search_queries[:5],
            concept_ids=[c for c in understanding.concept_ids if c in self.concepts][:4],
            pinned_ids=pinned_ids,
        )
        if set(signal.categories) & _AT_RISK:
            result = _without_crisis_sensitive(result)
        timings["retrieve"] = _ms(t0)
        pinned = [p for p in self.repo.get_passages(pinned_ids) if p.id not in result.allowed_ids()]
        yield Event("passages", self._passages_payload(result))

        # 3. Generate --------------------------------------------------------
        yield Event("status", {"stage": "writing"})
        t0 = time.perf_counter()
        safety_note = safety.concern_note(signal.categories) if signal.level == "concern" else None
        try:
            draft = self._call(
                prompts.ANSWER_SYSTEM,
                prompts.answer_user(
                    question=question,
                    history=history,
                    understanding=understanding,
                    result=result,
                    concepts=self.concepts,
                    pinned=pinned,
                    safety_note=safety_note,
                    translators=self.translators,
                ),
                GuidanceDraft,
                "answer",
            )
        except LLMError as exc:
            log.warning("answer generation failed: %s (%s)", exc.code, exc)
            yield Event("error", {"code": exc.code, "message": str(exc)})
            yield done(
                self._retrieval_only_answer(
                    answer_id,
                    language,
                    result,
                    notice=f"AI guidance is unavailable right now ({exc}).",
                )
            )
            return
        timings["generate"] = _ms(t0)

        # 4. Verify and assemble ---------------------------------------------
        allowed = self._allowed(result, pinned)
        draft, report = Verifier(allowed).draft(draft)
        yield done(self._assemble(answer_id, language, draft, report, result, allowed, signal, safety_note))

    # -- helpers -------------------------------------------------------------

    def _call(self, system: str, user: str, schema: type, step: Literal["understand", "answer"]) -> Any:
        assert self.llm is not None
        config = step_config(self.settings, step)
        try:
            return self.llm.structured(system=system, user=user, schema=schema, step=config)
        except LLMBadOutput:
            # One retry for malformed or truncated output.
            return self.llm.structured(system=system, user=user, schema=schema, step=config)

    def _generated_by(self, step: Literal["understand", "answer"]) -> GeneratedBy:
        return GeneratedBy(provider=self.llm_status.provider, model=step_config(self.settings, step).model)

    def _allowed(self, result: RetrievalResult, pinned: list[Passage]) -> dict[str, Passage]:
        allowed: dict[str, Passage] = {}
        for item in result.passages:
            for passage in [item.passage, *item.context_before, *item.context_after]:
                allowed[passage.id] = passage
        for passage in pinned:
            allowed[passage.id] = passage
        return allowed

    def _passages_payload(self, result: RetrievalResult) -> dict[str, Any]:
        return {
            "passages": [
                passage_view(i.passage, self.lookup).model_dump(mode="json") for i in result.passages
            ],
            "retrieval": self._retrieval_view(result).model_dump(mode="json"),
        }

    def _retrieval_view(self, result: RetrievalResult) -> RetrievalView:
        return RetrievalView(
            queries=result.queries,
            concepts=[
                ConceptMatchView(id=m.concept.id, name=m.concept.name, via=m.via) for m in result.concepts
            ],
            evidence=result.evidence,
            passage_ids=[i.passage.id for i in result.passages],
        )

    def _assemble(
        self,
        answer_id: str,
        language: str,
        draft: GuidanceDraft,
        report: Any,
        result: RetrievalResult,
        allowed: dict[str, Passage],
        signal: safety.SafetySignal,
        safety_note: str | None,
    ) -> AnswerView:
        def view(pid: str) -> PassageView:
            return passage_view(allowed[pid], self.lookup)

        kind: AnswerKind = draft.response_kind
        return AnswerView(
            id=answer_id,
            kind=kind,
            language=language,
            situation=draft.situation,
            teachings=[
                TeachingView(passage=view(t.passage_id), **t.model_dump(exclude={"passage_id"}))
                for t in draft.teachings
            ],
            path_forward_intro=draft.path_forward_intro,
            steps=[StepView(**s.model_dump()) for s in draft.steps],
            framework=draft.framework,
            reflective_question=draft.reflective_question,
            message=draft.follow_up_message,
            related=[RelatedView(passage=view(r.passage_id), reason=r.reason) for r in draft.related],
            passages=[view(i.passage.id) for i in result.passages],
            evidence=draft.evidence,
            evidence_note=draft.evidence_note,
            alternative_readings=draft.alternative_readings,
            suggested_follow_ups=draft.suggested_follow_ups,
            safety=(
                SafetyView(
                    level="concern",
                    message=safety_note,
                    resources=safety.resources_for(signal.categories),
                )
                if signal.level == "concern"
                else None
            ),
            verification=VerificationView(checked=True, issues=report.issues, cited_ids=report.cited_ids),
            references=[
                ReferenceView(id=pid, ref=v.ref, short_ref=v.short_ref, path=v.path)
                for pid in report.cited_ids
                for v in [view(pid)]
            ],
            generated_by=self._generated_by("answer"),
            retrieval=self._retrieval_view(result),
        )

    def _crisis_answer(self, answer_id: str, language: str, signal: safety.SafetySignal) -> AnswerView:
        return AnswerView(
            id=answer_id,
            kind="crisis",
            language=language,
            message=safety.crisis_message(language),
            safety=SafetyView(
                level="crisis", message=None, resources=safety.resources_for(signal.categories)
            ),
        )

    def _retrieval_only(
        self,
        answer_id: str,
        question: str,
        language: str,
        pinned_ids: list[str],
        timings: dict[str, float],
        done: Any,
        *,
        notice: str,
    ) -> Iterator[Event]:
        yield Event("status", {"stage": "retrieving"})
        t0 = time.perf_counter()
        result = self.retriever.retrieve(question=question, pinned_ids=pinned_ids, top_k=6)
        timings["retrieve"] = _ms(t0)
        yield Event("passages", self._passages_payload(result))
        yield done(self._retrieval_only_answer(answer_id, language, result, notice=notice))

    def _retrieval_only_answer(
        self, answer_id: str, language: str, result: RetrievalResult, *, notice: str
    ) -> AnswerView:
        return AnswerView(
            id=answer_id,
            kind="retrieval_only",
            language=language,
            passages=[passage_view(i.passage, self.lookup) for i in result.passages],
            evidence=_evidence_label(result.evidence),
            retrieval=self._retrieval_view(result),
            notice=notice + " The passages below were found by search; no AI interpretation "
            "was generated. Read each one in its context.",
        )

    def _not_configured_notice(self) -> str:
        detail = self.llm_status.detail or "No language model is configured."
        return f"AI guidance is not set up on this server. {detail}"


def understand_for_eval(question: str) -> tuple[list[str], list[str]]:
    """Stage-1 query rewriting for the retrieval evaluation (`--with-llm`)."""
    from app.config import get_settings
    from app.corpus import load_corpus
    from app.generation.llm import get_llm
    from app.ingestion.pipeline import PROCESSED_DIR

    settings = get_settings()
    llm, status = get_llm()
    if llm is None:
        raise SystemExit(f"--with-llm needs a configured language model: {status.detail}")

    concepts = load_corpus(PROCESSED_DIR).concepts
    understanding = llm.structured(
        system=prompts.understand_system(concepts),
        user=prompts.understand_user(question, []),
        schema=Understanding,
        step=step_config(settings, "understand"),
    )
    return understanding.search_queries, understanding.concept_ids


SHORT_QUESTION_WORDS = 12

# A "crisis" verdict from the model must name what the crisis is; without a
# crisis category it is treated as "concern" (safety panel plus a guarded answer).
_CRISIS_CATEGORIES = {
    "suicide_or_self_harm",
    "abuse_or_unsafe_home",
    "violence_toward_others",
    "medical_emergency",
}


def _model_safety(understanding: Understanding) -> tuple[Literal["none", "concern", "crisis"], list[str]]:
    level = understanding.safety.level
    categories: list[str] = list(understanding.safety.categories)
    if level == "crisis" and not set(categories) & _CRISIS_CATEGORIES:
        level = "concern"
        if not categories:
            categories = ["severe_distress"]
    return level, categories


def _reconcile_language(model_language: str, script_language: str) -> str:
    """The model's language label must agree with the script actually used:
    Hindi means Devanagari; romanized Hindi is Hinglish."""
    if script_language == "hi":
        return "hi"
    if model_language in ("hi", "other"):
        return script_language
    return model_language


# When someone may be at risk, verses about death and fighting are withheld;
# for questions seeking justification for harm they stay, with their context
# notes, so the reply can explain what they do and do not mean.
_AT_RISK = {"suicide_or_self_harm", "severe_distress", "medical_emergency"}


def _recent_citations(history: list[HistoryTurn]) -> list[str]:
    for turn in reversed(history):
        if turn.role == "assistant" and turn.passage_ids:
            return turn.passage_ids[:6]
    return []


def _without_crisis_sensitive(result: RetrievalResult) -> RetrievalResult:
    """Drop passages marked unsuitable when someone may be at risk."""

    def ok(passage: Passage) -> bool:
        return not any(n.get("exclude_in_crisis") for n in passage.metadata.get("sensitivity", []))

    kept = []
    for item in result.passages:
        if not ok(item.passage):
            continue
        item.context_before = [p for p in item.context_before if ok(p)]
        item.context_after = [p for p in item.context_after if ok(p)]
        kept.append(item)
    result.passages = kept
    return result


def _evidence_label(evidence: str) -> Literal["strong", "moderate", "limited"]:
    return "limited" if evidence == "weak" else evidence  # type: ignore[return-value]


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)
