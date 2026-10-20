from app.retrieval.hinglish import is_hinglish, rule_based, to_devanagari


def test_hinglish_with_english_words_keeps_the_english() -> None:
    out = to_devanagari("Breakup ke baad move on nahi kar pa raha, profile check karta hoon.")
    assert out == "Breakup के बाद move on नहीं कर पा रहा, profile check करता हूँ."


def test_devanagari_hindi_is_left_alone() -> None:
    assert not is_hinglish("मुझे बहुत गुस्सा आता है और मैं बाद में पछताता हूँ।")
    assert to_devanagari("मुझे बहुत गुस्सा आता है") is None
    # Mixed scripts count as Devanagari: there is nothing to render.
    assert to_devanagari("मुझे gussa aata hai, kya karun?") is None


def test_romanized_sanskrit_lookups_are_left_alone() -> None:
    for verse in [
        "karmanye vadhikaraste ma phaleshu kadachana",
        "yada yada hi dharmasya glanir bhavati bharata",
        "vasudhaiva kutumbakam",
    ]:
        assert to_devanagari(verse) is None, verse


def test_english_is_left_alone_even_with_words_hindi_shares() -> None:
    for sentence in [
        "The main thing is to use my time well.",
        "I want to par my score and ho ho ho, a merry time.",
        "I keep failing interviews and I'm jealous of my friends.",
        "Is it okay to quit?",
    ]:
        assert not is_hinglish(sentence), sentence
        assert to_devanagari(sentence) is None


def test_punctuation_and_spacing_are_kept() -> None:
    assert to_devanagari("Kya karun?!  Samajh nahi aata...") == "क्या करूँ?!  समझ नहीं आता..."


def test_empty_and_wordless_input() -> None:
    assert to_devanagari("") is None
    assert to_devanagari("   ") is None
    assert to_devanagari("?!. 123") is None


def test_one_hindi_word_is_not_enough() -> None:
    # "Namaste, how are you?" has no two Hindi function words.
    assert not is_hinglish("Namaste, how are you? I feel bahut tired.")


def test_rule_based_spelling_is_hindi_not_sanskrit() -> None:
    assert rule_based("gussa") == "गुस्सा"  # final a is long
    assert rule_based("dadi") == "ददी"  # final i is long; the first vowel cannot be known
    assert not rule_based("bahut").endswith("्")  # no virama on a final consonant


def test_rule_based_fallback_keeps_known_english() -> None:
    out = to_devanagari("Papa chahte hain main engineer banu", english={"engineer"}, rule_based_fallback=True)
    assert out == "पापा चाहते हैं मैं engineer बनूँ"


def test_deterministic() -> None:
    question = "Raat ko teen baje tak reels scroll karta rehta hoon, subah uth nahi pata."
    assert to_devanagari(question) == to_devanagari(question)
