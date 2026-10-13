from app.ingestion.normalize import clean_devanagari, loose_roman, orthographic_key, to_iast
from app.retrieval.text import query_roman_key


def test_clean_devanagari_fixes_transcription_artefacts() -> None:
    text = "न जिजीविषाम: तेऽवस्थिताः ॥ ॥ ६ ॥\u200b"
    cleaned = clean_devanagari(text)
    assert "ः" in cleaned and ":" not in cleaned  # ASCII colon typed for visarga
    assert "॥ ॥" not in cleaned
    assert "\u200b" not in cleaned


def test_clean_devanagari_keeps_zwnj() -> None:
    assert "\u200c" in clean_devanagari("गुह्याद्\u200cगुह्यतरं")


def test_orthographic_key_folds_spelling_conventions() -> None:
    assert orthographic_key("सङ्ग्रामं") == orthographic_key("संग्रामं")  # class nasal
    assert orthographic_key("तथाऽसक्त") == orthographic_key("तथासक्त")  # avagraha
    assert orthographic_key("विशालम् ।") == orthographic_key("विशालं ।")  # final m
    assert orthographic_key("निश्चितं") == orthographic_key("निश्िचतं")  # legacy-font artefact
    assert orthographic_key("भक्तिं") == orthographic_key("भक्ितं")
    assert orthographic_key("विवस्वान्मनवे") == orthographic_key("विवस्वान् मनवे")  # word division


def test_orthographic_key_keeps_real_differences() -> None:
    assert orthographic_key("नैनं") != orthographic_key("नैवं")
    assert orthographic_key("त्वां") != orthographic_key("त्वा")


def test_iast_transliteration() -> None:
    assert to_iast("कर्मण्येवाधिकारस्ते") == "karmaṇyevādhikāraste"
    assert to_iast("श्रद्धावाँल्लभते") == "śraddhāvām\u0310llabhate"  # candrabindu


def test_loose_roman_matches_casual_spelling() -> None:
    iast = loose_roman("karmaṇyevādhikāraste mā phaleṣu kadācana").replace(" ", "")
    casual = query_roman_key("karmanye vadhikaraste ma phaleshu kadachana")
    assert iast == casual
    assert query_roman_key("कर्मण्येवाधिकारस्ते") in iast
