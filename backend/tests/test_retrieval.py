from app.retrieval.hybrid import HybridRetriever
from app.retrieval.text import keywords


def ids(result) -> list[str]:  # type: ignore[no-untyped-def]
    return [item.passage.id for item in result.passages]


def test_half_remembered_verse_finds_itself(retriever: HybridRetriever) -> None:
    assert ids(retriever.retrieve(question="karmanye vadhikaraste ma phaleshu kadachana"))[0] == "bg.2.47"
    assert ids(retriever.retrieve(question="यदा यदा हि धर्मस्य ग्लानिर्भवति भारत"))[0] == "bg.4.7"


def test_knowledge_question_by_meaning(retriever: HybridRetriever) -> None:
    result = retriever.retrieve(question="verse comparing a steady mind to a lamp in a windless place")
    assert "bg.6.19" in ids(result)[:3]


def test_life_situation_reaches_relevant_teachings(retriever: HybridRetriever) -> None:
    result = retriever.retrieve(
        question="I keep failing interviews and I'm jealous of my friends",
        queries=["fruit of action", "free from envy"],
        concept_ids=["action-without-attachment", "comparison-and-envy"],
    )
    found = set(ids(result))
    assert {"bg.2.47", "bg.4.22"} & found
    assert result.evidence == "strong"  # model-chosen concepts


def test_results_carry_context_and_no_adjacent_duplicates(retriever: HybridRetriever) -> None:
    result = retriever.retrieve(question="anger arises from desire", top_k=8)
    positions = [(i.passage.division["chapter"], i.passage.division["verse"]) for i in result.passages]
    for a in positions:
        for b in positions:
            assert not (a[0] == b[0] and abs(a[1] - b[1]) == 1), "adjacent verses should be context"
    first = result.passages[0]
    assert first.context_before or first.context_after
    assert result.allowed_ids() >= set(ids(result))


def test_hindi_and_hinglish_questions(retriever: HybridRetriever) -> None:
    hindi = retriever.retrieve(question="मुझे बहुत गुस्सा आता है और मैं बाद में पछताता हूँ।")
    assert {"bg.2.62", "bg.2.63", "bg.3.37"} & set(ids(hindi))
    hinglish = retriever.retrieve(question="Mujhe bahut gussa aata hai aur baad mein regret hota hai.")
    assert {"bg.2.62", "bg.2.63", "bg.3.37", "bg.2.56"} & set(ids(hinglish))


def test_cross_lingual_keywords() -> None:
    assert "wrath" in keywords("मुझे बहुत गुस्सा आता है")
    assert "envy" in keywords("doston se jalan hoti hai")


def test_unrelated_question_gets_weak_evidence(retriever: HybridRetriever) -> None:
    assert retriever.retrieve(question="What is the capital of Australia?").evidence == "weak"


def test_source_filter(retriever: HybridRetriever) -> None:
    assert retriever.retrieve(question="anger", source_ids=["no-such-source"]).passages == []
