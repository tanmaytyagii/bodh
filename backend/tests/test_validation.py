from app.corpus import Concept, Corpus
from app.ingestion.validate import _misquotes, _term_attested, validate


def test_processed_corpus_validates(corpus: Corpus) -> None:
    report = validate(corpus)
    assert report.ok, report.errors[:5]
    assert report.stats["by_source"] == {
        "bhagavad-gita": 701,
        "isha-upanishad": 18,
        "katha-upanishad": 119,
        "kena-upanishad": 34,
    }


def test_fabricated_quote_in_editorial_text_is_caught(corpus: Corpus) -> None:
    text = 'Krishna says "you deserve whatever you want" (2.47).'
    assert _misquotes(text, ["bg.2.47"], corpus) == ["you deserve whatever you want"]
    assert (
        _misquotes('"Thy business is with the action only" … "never with its fruits"', ["bg.2.47"], corpus)
        == []
    )


def test_unattested_sanskrit_term_is_caught(corpus: Corpus) -> None:
    assert _term_attested("karmaphala", ["bg.2.47"], corpus)
    assert _term_attested("abhyāsa", ["bg.6.35"], corpus)  # inflected: abhyāsena
    assert not _term_attested("nirvāṇa", ["bg.2.47"], corpus)


def test_concept_pointing_at_missing_passage_is_an_error(corpus: Corpus) -> None:
    broken = corpus.model_copy(deep=True)
    broken.concepts.append(Concept(id="broken", name="Broken", summary="x", passage_ids=["bg.99.1"]))
    report = validate(broken)
    assert any("broken" in e and "bg.99.1" in e for e in report.errors)


def test_devanagari_in_translation_is_an_error(corpus: Corpus) -> None:
    broken = corpus.model_copy(deep=True)
    broken.passages[0].translation += " कृपया"
    report = validate(broken)
    assert any("Devanagari text inside the English translation" in e for e in report.errors)


def test_passage_from_an_edition_that_does_not_cover_its_source_is_an_error(corpus: Corpus) -> None:
    broken = corpus.model_copy(deep=True)
    edition = next(e for e in broken.editions if e.id == "paramananda-1919")
    edition.source_ids = ["katha-upanishad"]
    errors = validate(broken).errors
    assert any(
        "isha.1.1: edition 'paramananda-1919' does not list source 'isha-upanishad'" in e for e in errors
    )
