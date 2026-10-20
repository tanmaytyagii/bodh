"""The processed Gita corpus: structure, provenance, and known edge cases."""

import re
from collections import Counter

from app.corpus import Corpus
from app.ingestion.sources.gita_besant import EXPECTED_VERSES


def test_every_verse_is_present_and_ordered(corpus: Corpus) -> None:
    gita = [p for p in corpus.passages if p.source_id == "bhagavad-gita"]
    assert len(gita) == sum(EXPECTED_VERSES.values()) == 701
    for chapter, count in EXPECTED_VERSES.items():
        verses = [p.division["verse"] for p in gita if p.division["chapter"] == chapter]
        assert verses == list(range(1, count + 1))
    positions = [p.position for p in gita]
    assert positions == sorted(positions)


def test_chapter_titles_come_from_the_colophons(corpus: Corpus) -> None:
    divisions = corpus.sources[0].divisions
    assert all(d.title and d.title_original for d in divisions)
    assert divisions[1].title == "Yoga by the Sankhya"
    assert divisions[1].title_original == "साङ्ख्ययोग"
    assert divisions[0].title_original == "अर्जुनविषादयोग"  # restored from sandhi
    assert divisions[17].title_original == "मोक्षसंन्यासयोग"  # [sic] correction applied


def test_speaker_distribution_matches_the_text(corpus: Corpus) -> None:
    counts = Counter(p.speaker for p in corpus.passages if p.source_id == "bhagavad-gita")
    assert counts == {"Krishna": 574, "Arjuna": 84, "Sanjaya": 42, "Dhritarashtra": 1}
    by_id = corpus.passage_map()
    assert by_id["bg.1.21"].metadata["speakers"] == ["Sanjaya", "Arjuna"]
    assert by_id["bg.1.28"].metadata["speakers"] == ["Sanjaya", "Arjuna"]


def test_known_verses(corpus: Corpus) -> None:
    by_id = corpus.passage_map()
    assert by_id["bg.2.47"].translation.startswith("Thy business is with the action only")
    assert by_id["bg.2.47"].transliteration.startswith("karmaṇyevādhikāraste")
    # Verses that begin with इति must not be mistaken for chapter colophons.
    for pid in ("bg.13.19", "bg.15.20", "bg.18.63"):
        assert by_id[pid].sanskrit.startswith("इति")
    # The half-line printed outside the Sanskrit block is restored to 1.28.
    assert by_id["bg.1.28"].sanskrit.startswith("कृपया परयाऽऽविष्टो")


def test_translations_and_sanskrit_do_not_bleed_into_each_other(corpus: Corpus) -> None:
    for p in corpus.passages:
        assert not re.search("[\u0900-\u097f]", p.translation), p.id
        if p.source_id == "bhagavad-gita":
            assert p.sanskrit and not re.search("[A-Za-z]", p.sanskrit), p.id


def test_every_passage_is_traceable(corpus: Corpus) -> None:
    for p in corpus.passages:
        if p.source_id == "bhagavad-gita":
            assert p.citation.url.startswith("https://en.wikisource.org/wiki/Bhagavad-Gita_(Besant_4th)/")
            assert p.citation.scan_url and "/Page:" in p.citation.scan_url
            assert p.citation.page
            assert p.cross_checks, p.id
        else:
            assert p.citation.url.startswith(
                "https://www.gutenberg.org/cache/epub/3283/pg3283-images.html#id"
            )


def test_misnumbered_english_verses_are_recorded(corpus: Corpus) -> None:
    by_id = corpus.passage_map()
    fix = next(c for c in by_id["bg.17.19"].corrections if c.field == "verse_number")
    assert fix.printed == "(20)" and fix.corrected == "(19)"


def test_sanskrit_corrections_are_settled_by_the_cross_check(corpus: Corpus) -> None:
    by_id = corpus.passage_map()
    confirmed = next(c for c in by_id["bg.2.3"].corrections if c.field == "sanskrit")
    assert confirmed.applied and "Confirmed" in confirmed.basis
    reverted = next(c for c in by_id["bg.4.22"].corrections if c.field == "sanskrit")
    assert not reverted.applied and "printed reading agrees" in reverted.basis
    assert "निबध्यते" in by_id["bg.4.22"].sanskrit


def test_provenance_status_reflects_cross_check(corpus: Corpus) -> None:
    statuses = Counter(p.provenance_status for p in corpus.passages)
    assert statuses["verified"] > 650
    for p in corpus.passages:
        if p.source_id != "bhagavad-gita":
            assert p.provenance_status == "unverified" and not p.sanskrit
            continue
        check = p.cross_checks[0]
        expected = "verified" if check.status in ("exact", "orthographic") else "needs_review"
        assert p.provenance_status == expected, p.id


def test_sensitivity_notes_are_attached(corpus: Corpus) -> None:
    by_id = corpus.passage_map()
    notes = {n["id"] for n in by_id["bg.2.20"].metadata["sensitivity"]}
    assert "self-and-death" in notes
    assert any(n["exclude_in_crisis"] for n in by_id["bg.2.20"].metadata["sensitivity"])
    assert by_id["bg.2.47"].metadata["sensitivity"] == []


def test_upanishads_follow_the_standard_division(corpus: Corpus) -> None:
    def counts(source: str) -> list[int]:
        return [d.passage_count for d in next(s for s in corpus.sources if s.id == source).divisions]

    assert counts("isha-upanishad") == [18]
    assert counts("katha-upanishad") == [29, 25, 17, 15, 15, 18]
    assert counts("kena-upanishad") == [8, 5, 12, 9]
    by_id = corpus.passage_map()
    good = by_id["katha.2.1"]
    assert good.ref == "Katha Upanishad 1.2.1"
    assert good.translation.startswith("Yama said: The good is one thing and the pleasant another.")
    # The translator's commentary is attached as notes (not every verse has one).
    assert by_id["kena.1.1"].translator_notes[0].text.startswith("Thus the disciple approached the Master")
    fix = by_id["katha.1.2"].corrections[0]
    assert fix.printed == "yet resected:" and "yet reflected:" in by_id["katha.1.2"].translation


def test_story_excerpts_exist_and_quotes_are_verbatim(corpus: Corpus) -> None:
    story = next(s for s in corpus.stories if s.id == "nachiketas-and-death")
    by_id = corpus.passage_map()
    assert all(pid in by_id for pid in story.excerpt_ids + story.related_passage_ids)
    assert "Man cannot be satisfied by wealth" in by_id["katha.1.27"].translation


def test_every_story_is_grounded_in_its_own_source(corpus: Corpus) -> None:
    from app.ingestion.validate import _misquotes

    by_id = corpus.passage_map()
    assert len(corpus.stories) >= 4
    for story in corpus.stories:
        assert story.excerpt_ids, story.id
        assert all(pid in by_id for pid in story.excerpt_ids + story.related_passage_ids), story.id
        # Excerpts come from the story's own text; related passages may come from anywhere.
        assert {by_id[pid].source_id for pid in story.excerpt_ids} == {story.source_id}, story.id
        text = " ".join(
            [story.summary, story.dilemma, *story.lessons, *story.caveats]
            + [f"{c.choice} {c.consequence or ''}" for c in story.choices]
        )
        assert _misquotes(text, story.excerpt_ids + story.related_passage_ids, corpus) == [], story.id
        assert story.caveats, f"{story.id}: an editorial story says what it does not claim"


def test_a_corpus_without_stories_serves_none(corpus: Corpus, repo) -> None:  # type: ignore[no-untyped-def]
    from app.config import BACKEND_DIR
    from app.storage.memory import MemoryRepository

    cache = BACKEND_DIR / ".cache" / "embeddings"
    bare = MemoryRepository(corpus.model_copy(update={"stories": []}), repo.embedder, cache_dir=cache)
    assert bare.list_stories() == []
    assert bare.get_story("nachiketas-and-death") is None
