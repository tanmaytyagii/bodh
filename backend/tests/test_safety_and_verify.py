import pytest

from app.corpus import Corpus
from app.generation import safety
from app.generation.schemas import GuidanceDraft, StepDraft, TeachingDraft
from app.generation.verify import Verifier


@pytest.mark.parametrize(
    "text",
    [
        "I don't want to live anymore",
        "sometimes I think about ending my life",
        "I have been cutting myself again",
        "मैं अब जीना नहीं चाहता",
        "jeene ka mann nahi karta, sab khatam",
        "Mann karta hai khud ko khatam kar doon",
    ],
)
def test_crisis_language_is_detected(text: str) -> None:
    assert safety.detect(text).level == "crisis"


@pytest.mark.parametrize(
    "text",
    [
        "I want to kill my presentation tomorrow",
        "this deadline is killing me",
        "I failed my exam and feel terrible",
        "My friend betrayed me",
    ],
)
def test_ordinary_language_is_not_flagged(text: str) -> None:
    assert safety.detect(text).level == "none"


def test_abuse_and_harm_justification_raise_concern() -> None:
    abuse = safety.detect("My husband hits me when he is angry")
    assert abuse.level == "concern" and "abuse_or_unsafe_home" in abuse.categories
    assert any(r.contact == "181" for r in safety.resources_for(abuse.categories))
    harm = safety.detect("Does the Gita say it's okay to punish people who insult me?")
    assert "harm_justification" in harm.categories


def test_signal_only_rises() -> None:
    signal = safety.detect("I feel lost")
    signal.raise_to("crisis", ["suicide_or_self_harm"])
    signal.raise_to("none", [])
    assert signal.level == "crisis"


def test_language_guess() -> None:
    assert safety.guess_language("मुझे डर लगता है") == "hi"
    assert safety.guess_language("mujhe bahut dar lagta hai") == "hinglish"
    assert safety.guess_language("I am afraid") == "en"


def _draft(**overrides) -> GuidanceDraft:  # type: ignore[no-untyped-def]
    teaching = TeachingDraft(
        passage_id="bg.2.47",
        what_it_says="x",
        context="x",
        interpretation_notes=None,
        why_it_applies="x",
        application="x",
        limits="x",
    )
    data = dict(
        response_kind="guidance",
        situation="x",
        teachings=[teaching],
        path_forward_intro="x",
        steps=[StepDraft(title="x", detail="x", timeframe="today")],
        framework=None,
        reflective_question="x",
        follow_up_message=None,
        summary=None,
        related=[],
        evidence="strong",
        evidence_note=None,
        alternative_readings=None,
        suggested_follow_ups=[],
    )
    data.update(overrides)
    return GuidanceDraft(**data)


def test_verifier_removes_citations_that_were_not_provided(corpus: Corpus) -> None:
    allowed = {pid: corpus.passage_map()[pid] for pid in ("bg.2.47", "bg.2.48")}
    draft = _draft(situation="See [[bg.2.47]] and [[bg.18.66]].")
    draft.teachings.append(draft.teachings[0].model_copy(update={"passage_id": "bg.18.66"}))
    out, report = Verifier(allowed).draft(draft)
    assert [t.passage_id for t in out.teachings] == ["bg.2.47"]
    assert "[[bg.18.66]]" not in out.situation and "[[bg.2.47]]" in out.situation
    assert report.cited_ids == ["bg.2.47"]
    assert len(report.issues) == 2


def test_verifier_checks_quotations(corpus: Corpus) -> None:
    allowed = {"bg.2.47": corpus.passage_map()["bg.2.47"]}
    draft = _draft(
        situation="Krishna says “Thy business is with the action only” here.",
        reflective_question='As the Gita says, "work hard and success will surely come to you".',
    )
    out, report = Verifier(allowed).draft(draft)
    assert "“Thy business is with the action only”" in out.situation  # verbatim: kept
    assert '"' not in out.reflective_question  # not in the sources: unquoted
    assert any("quotation marks removed" in issue for issue in report.issues)


def test_verifier_checks_the_summary_and_keeps_it_short(corpus: Corpus) -> None:
    allowed = {"bg.2.47": corpus.passage_map()["bg.2.47"]}
    draft = _draft(
        summary=(
            "Your effort is yours to give; the result is not [[bg.2.47]][[bg.18.66]]. "
            'As it says, "success will surely come to you if you work hard". '
            "Start small. Keep going. Rest when you need to."
        )
    )
    out, report = Verifier(allowed).draft(draft)
    assert out.summary is not None
    assert "[[bg.2.47]]" in out.summary and "[[bg.18.66]]" not in out.summary
    # Wording the sources do not contain is not presented as a quotation.
    assert '"' not in out.summary
    assert out.summary.endswith("Start small.")
    assert "summary: shortened to its first 3 sentences" in report.issues
    assert any("summary: removed citation of bg.18.66" in issue for issue in report.issues)


def test_an_empty_summary_becomes_none(corpus: Corpus) -> None:
    allowed = {"bg.2.47": corpus.passage_map()["bg.2.47"]}
    out, _ = Verifier(allowed).draft(_draft(summary="  [[bg.18.66]]  "))
    assert out.summary is None
    out, _ = Verifier(allowed).draft(_draft(summary=None))
    assert out.summary is None


def test_follow_ups_and_clarifications_never_carry_a_summary(corpus: Corpus) -> None:
    # The prompt asks for null; a model that sends one anyway is corrected, and it is reported.
    allowed = {"bg.2.47": corpus.passage_map()["bg.2.47"]}
    for kind in ("follow_up", "clarification"):
        draft = _draft(response_kind=kind, follow_up_message="x", summary="Keep going [[bg.2.47]].")
        out, report = Verifier(allowed).draft(draft)
        assert out.summary is None, kind
        assert any("summary" in issue for issue in report.issues), kind


def test_guidance_without_valid_teachings_is_downgraded(corpus: Corpus) -> None:
    out, _ = Verifier({}).draft(_draft())
    assert out.response_kind == "insufficient_sources" and out.evidence == "limited"
