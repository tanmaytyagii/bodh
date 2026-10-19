"""The question → guidance workflow, with a fake language model."""

import pytest
from pydantic import ValidationError

from app.config import get_settings
from app.generation import safety
from app.generation.llm import LLMStatus, LLMUnavailable
from app.generation.schemas import SafetyAssessment
from app.generation.service import AskRequest, GuidanceService, HistoryTurn
from app.retrieval import text as search_text
from app.retrieval.hybrid import HybridRetriever
from app.storage.memory import MemoryRepository
from tests.conftest import FakeLLM

QUESTION = (
    "I am preparing for placements. My friends are getting great offers, but I keep failing "
    "interviews. I feel jealous and anxious."
)


def service(repo: MemoryRepository, retriever: HybridRetriever, llm: FakeLLM | None) -> GuidanceService:
    status = LLMStatus("fake", True, "fake") if llm else LLMStatus("none", False, None, "disabled")
    return GuidanceService(
        repo=repo, retriever=retriever, llm=llm, llm_status=status, settings=get_settings()
    )


def test_full_guidance_is_grounded_and_verified(repo, retriever, fake_llm) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, fake_llm).ask(AskRequest(question=QUESTION))
    assert answer.kind == "guidance"
    assert [s for s, _ in fake_llm.calls] == ["Understanding", "GuidanceDraft"]
    # The invented passage bg.99.99 is dropped; every cited passage was retrieved.
    allowed = {p.id for p in answer.passages}
    assert all(t.passage.id != "bg.99.99" for t in answer.teachings)
    assert answer.verification and answer.verification.checked
    assert any("bg.99.99" in issue for issue in answer.verification.issues)
    assert "[[bg.99.99]]" not in (answer.situation or "")
    # Rendered passages come from the corpus, not the model.
    teaching = answer.teachings[0]
    assert teaching.passage.translation == repo.get_passage(teaching.passage.id).translation
    assert teaching.passage.id in allowed | {c for c in answer.verification.cited_ids}
    # A quotation the sources do not contain is not presented as one.
    assert '"' not in teaching.application
    assert answer.generated_by and answer.generated_by.provider == "fake"
    assert answer.retrieval and answer.retrieval.queries[0] == QUESTION


def test_stream_emits_stages_in_order(repo, retriever, fake_llm) -> None:  # type: ignore[no-untyped-def]
    events = [e.type for e in service(repo, retriever, fake_llm).stream(AskRequest(question=QUESTION))]
    assert events == ["status", "understanding", "status", "passages", "status", "answer"]


def test_without_a_model_returns_labelled_passages(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, None).ask(AskRequest(question=QUESTION))
    assert answer.kind == "retrieval_only"
    assert answer.passages and not answer.teachings
    assert answer.notice and "no AI interpretation" in answer.notice
    assert answer.generated_by is None


def test_model_failure_falls_back_to_passages(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(fail=LLMUnavailable("Rate limited."), fail_on="GuidanceDraft")
    events = list(service(repo, retriever, llm).stream(AskRequest(question=QUESTION)))
    assert "error" in [e.type for e in events]
    answer = events[-1].data
    assert answer["kind"] == "retrieval_only" and answer["passages"]


def test_crisis_short_circuits_before_the_model(repo, retriever, fake_llm) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, fake_llm).ask(AskRequest(question="I don't want to live anymore"))
    assert answer.kind == "crisis" and fake_llm.calls == []
    assert answer.safety and answer.safety.resources[0].contact.startswith("14416")
    assert not answer.passages


def test_model_flagged_crisis_is_respected(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(
        understanding={
            "safety": SafetyAssessment(level="crisis", categories=["suicide_or_self_harm"], note="x")
        }
    )
    answer = service(repo, retriever, llm).ask(AskRequest(question="Everything is pointless lately."))
    assert answer.kind == "crisis"
    # The crisis reply as it always was: its message and resources, no summary, and no drafted answer.
    assert answer.message == safety.crisis_message("en") and answer.summary is None
    assert answer.safety and answer.safety.level == "crisis" and answer.safety.resources
    assert [name for name, _ in llm.calls] == ["Understanding"]


def test_concern_withholds_crisis_sensitive_verses(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(
        understanding={
            "safety": SafetyAssessment(level="concern", categories=["severe_distress"], note="x"),
            "concept_ids": ["grief-and-the-self"],
        }
    )
    answer = service(repo, retriever, llm).ask(AskRequest(question="My father died and I can't cope."))
    shown = {p.id for p in answer.passages}
    assert not shown & {"bg.2.20", "bg.2.22", "bg.2.27"}
    assert answer.safety and answer.safety.level == "concern"


def test_out_of_scope_and_clarification(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    oos = service(repo, retriever, FakeLLM(understanding={"request_type": "out_of_scope"}))
    assert oos.ask(AskRequest(question="Fix my React bug")).kind == "out_of_scope"
    clarify = service(repo, retriever, FakeLLM(understanding={"clarifying_question": "What happened?"}))
    answer = clarify.ask(AskRequest(question="What should I do?"))
    assert answer.kind == "clarification" and answer.message == "What happened?"


def test_follow_up_keeps_earlier_citations_available(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(understanding={"request_type": "follow_up", "concept_ids": []})
    request = AskRequest(
        question="Can you explain the verse about inaction more?",
        history=[
            HistoryTurn(role="user", content=QUESTION),
            HistoryTurn(role="assistant", content="Summary of the earlier answer.", passage_ids=["bg.2.47"]),
        ],
    )
    service(repo, retriever, llm).ask(request)
    answer_prompt = llm.calls[-1][1]
    assert 'id="bg.2.47"' in answer_prompt
    assert "Summary of the earlier answer." in answer_prompt


def test_model_crisis_without_a_crisis_category_is_concern(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(understanding={"safety": SafetyAssessment(level="crisis", categories=[], note="unclear")})
    answer = service(repo, retriever, llm).ask(AskRequest(question="I have two job offers and can't decide."))
    assert answer.kind == "guidance"
    assert answer.safety and answer.safety.level == "concern"


def test_language_label_must_match_script(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(understanding={"language": "hi"})
    answer = service(repo, retriever, llm).ask(AskRequest(question="I keep failing interviews and feel low."))
    assert answer.language == "en"


def test_the_summary_is_checked_like_the_rest_of_the_answer(repo, retriever, fake_llm) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, fake_llm).ask(AskRequest(question=QUESTION))
    assert answer.summary
    # The invented citation is removed; the summary still rests on a cited passage.
    assert "[[bg.99.99]]" not in answer.summary
    assert any(f"[[{t.passage.id}]]" in answer.summary for t in answer.teachings)
    assert answer.verification and any("summary" in issue for issue in answer.verification.issues)


def test_crisis_replies_carry_no_summary(repo, retriever, fake_llm) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, fake_llm).ask(AskRequest(question="I don't want to live anymore"))
    assert answer.kind == "crisis" and answer.summary is None and fake_llm.calls == []


def test_passages_only_answers_say_why_each_passage_appeared(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, None).ask(AskRequest(question="How do I control anger at work?"))
    assert answer.retrieval
    matches = {m.passage_id: m for m in answer.retrieval.matches}
    assert set(matches) == {p.id for p in answer.passages}
    for passage in answer.passages:
        match = matches[passage.id]
        # A matched word is always a word of the passage's own translation, named once.
        translation = passage.translation.lower()
        assert all(word in translation for word in match.words)
        assert len({search_text.stem(word) for word in match.words}) == len(match.words)
        assert not match.asked_about and not match.from_conversation
    # Something real is named for the passages at the top.
    top = matches[answer.passages[0].id]
    assert top.words or top.themes or top.semantic or top.sanskrit


def test_a_half_remembered_verse_is_explained_as_a_sanskrit_match(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    answer = service(repo, retriever, None).ask(AskRequest(question="karmanye vadhikaraste"))
    assert answer.retrieval
    match = next(m for m in answer.retrieval.matches if m.passage_id == "bg.2.47")
    assert match.sanskrit


def test_asking_about_a_passage_searches_it_first(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    request = AskRequest(question="What could this mean for me?", passage_ids=["bg.2.47"])
    answer = service(repo, retriever, None).ask(request)
    assert answer.retrieval and "bg.2.47" in [p.id for p in answer.passages]
    match = next(m for m in answer.retrieval.matches if m.passage_id == "bg.2.47")
    assert match.asked_about and not match.from_conversation


def test_a_passage_asked_about_reaches_the_model(repo, retriever) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(understanding={"concept_ids": []})
    service(repo, retriever, llm).ask(
        AskRequest(question="How might this apply to my exams?", passage_ids=["bg.6.35"])
    )
    assert 'id="bg.6.35"' in llm.calls[-1][1]


def test_passage_ids_are_validated() -> None:
    assert AskRequest(question="x", passage_ids=[" BG.2.47 ", "bg.2.47"]).passage_ids == ["bg.2.47"]
    for bad in (["../../etc/passwd"], ["bg 2 47"], ["x" * 80], ["a", "b", "c", "d", "e"]):
        with pytest.raises(ValidationError):
            AskRequest(question="x", passage_ids=bad)
