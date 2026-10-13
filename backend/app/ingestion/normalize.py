"""Text normalization that never destroys meaningful Sanskrit characters.

Three levels, used for different purposes:

* `clean_devanagari` — the stored text. Only fixes transcription artefacts
  (stray zero-width spaces, ASCII colon typed for visarga, doubled dandas) and
  applies Unicode NFC. ZWJ/ZWNJ are preserved: they change how conjuncts render.
* `orthographic_key` — used only to *compare* editions. Folds spelling
  conventions that do not change the reading (class nasal vs anusvara,
  consonant doubling after repha, avagraha, punctuation, verse numbers).
* `loose_roman` — used only for fuzzy lexical matching of romanized input such
  as "karmanye vadhikaraste", where people type without diacritics.
"""

from __future__ import annotations

import re
import unicodedata

from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_ZERO_WIDTH_JUNK = re.compile("[\u200b\u2060\ufeff\u00ad]")
_COLON_AS_VISARGA = re.compile(r"(?<=[\u0900-\u097f]):")
_DOUBLED_DANDA = re.compile(r"॥(\s*॥)+")
_SPACES = re.compile(r"[ \t\u00a0]+")


def clean_devanagari(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = _ZERO_WIDTH_JUNK.sub("", text)
    text = _COLON_AS_VISARGA.sub("ः", text)
    text = text.replace("।।", "॥")
    text = _DOUBLED_DANDA.sub("॥", text)
    lines = [_SPACES.sub(" ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def to_iast(devanagari: str) -> str:
    """IAST transliteration generated from the stored Devanagari."""
    out = transliterate(devanagari, sanscript.DEVANAGARI, sanscript.IAST)
    out = out.replace("\u200c", "").replace("\u200d", "")
    # The library writes candrabindu (ँ) as "~"; IAST/ISO 15919 use m̐.
    return out.replace("~", "m\u0310")


# Class nasals before a consonant of their class are interchangeable with
# anusvara in most printed editions (सङ्ग / संग, पण्डित / पंडित).
_CLASS_NASAL = re.compile("ङ्(?=[कखगघङ])|ञ्(?=[चछजझञ])|ण्(?=[टठडढण])|न्(?=[तथदधनम])|म्(?=[पफबभम])")
# Older printings double a consonant after repha (कर्म्म for कर्म).
_REPHA_DOUBLING = re.compile(r"र्([क-ह])्\1")
_NON_LETTERS = re.compile(r"[^\u0900-\u0963\u0971-\u097f]")


# Artefacts of legacy-font conversion seen in some digital editions; they are
# not spellings anyone intends, so they are folded before comparison.
_ENCODING_ARTEFACTS = [
    # i-sign typed before its consonant cluster (भक्ित for भक्ति, श्िच for श्चि)
    (re.compile("्ि((?:[क-ह]्)*[क-ह])"), r"्\1ि"),
    (re.compile("ृ\u093c"), "ॄ"),  # nukta on vocalic r (पितृ़ for पितॄ)
    (re.compile("\u093c"), ""),  # nukta does not occur in Sanskrit
    (re.compile("श्रृ"), "शृ"),  # श्रृणु for शृणु
    (re.compile("ॐ"), "ओं"),
]
# Sandhi realised or not before a following word (both appear in print).
_VISARGA_SANDHI = [
    (re.compile(r"ाः(?=[\s।॥-]|$)"), "ा"),  # -āḥ elided before a voiced sound
    (re.compile(r"(?<![^\s])सः(?=\s)"), "स"),  # saḥ → sa before a consonant
    (re.compile(r"([िु])ः\s*(?=[गघजझडढदधबभयवलह])"), r"\1र्"),  # -iḥ/-uḥ → -ir/-ur
    (re.compile(r"ः\s*(?=[तथ])"), "स्"),
    (re.compile(r"ः\s*(?=[चछ])"), "श्"),
    (re.compile(r"ः\s*(?=[टठ])"), "ष्"),
]
_FINAL_M = re.compile(r"म्(?=[\s।॥]|$)")
# Consonant doubling conventions of older printings (युद्ध्यस्व / युध्यस्व,
# युद्धाच्छ्रेयो / युद्धाछ्रेयो).
_DOUBLING = [(re.compile("द्ध्य"), "ध्य"), (re.compile("च्छ"), "छ")]


def orthographic_key(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\u200c", "").replace("\u200d", "")
    for pattern, replacement in _ENCODING_ARTEFACTS + _VISARGA_SANDHI:
        text = pattern.sub(replacement, text)
    text = _FINAL_M.sub("ं", text)
    # Word division differs between editions (विवस्वान्मनवे / विवस्वान् मनवे);
    # remove it before folding nasals across word boundaries.
    text = re.sub(r"\s+", "", text)
    for pattern, replacement in _DOUBLING:
        text = pattern.sub(replacement, text)
    text = _CLASS_NASAL.sub("ं", text)
    text = _REPHA_DOUBLING.sub(r"र्\1", text)
    text = text.replace("ँ", "ं")  # chandrabindu vs anusvara
    text = text.replace("ऽ", "")
    text = re.sub(r"[।॥]", "", text)
    text = re.sub(r"[०-९0-9]", "", text)
    return _NON_LETTERS.sub("", text)


_DIACRITIC_MAP = str.maketrans(
    {
        "ā": "a",
        "ī": "i",
        "ū": "u",
        "ṛ": "r",
        "ṝ": "r",
        "ḷ": "l",
        "ḹ": "l",
        "ṅ": "n",
        "ñ": "n",
        "ṭ": "t",
        "ḍ": "d",
        "ṇ": "n",
        "ś": "s",
        "ṣ": "s",
        "ṃ": "m",
        "ṁ": "m",
        "ḥ": "h",
        "'": "",
        "’": "",
    }
)
_LOOSE_RULES = [
    (re.compile(r"(?<=[a-z])h(?=[a-z])"), ""),  # aspiration/sh/ch spelled loosely
    (re.compile(r"ri"), "r"),  # casual "ri" for ṛ (dhritarashtra)
    (re.compile(r"gy"), "jn"),  # casual "gy" for jñ (gyan)
    (re.compile(r"aa"), "a"),
    (re.compile(r"ee"), "i"),
    (re.compile(r"oo"), "u"),
    (re.compile(r"w"), "v"),
    (re.compile(r"[^a-z ]"), " "),
    (re.compile(r"\s+"), " "),
]


def loose_roman(text: str) -> str:
    """Fold IAST or casual romanization into a coarse key for fuzzy matching.

    Both "karmaṇyevādhikāraste" (IAST) and "karmanye vadhikaraste" (casual)
    map to similar strings, so trigram similarity can match them. Word
    boundaries are not reliable in sandhi-joined Sanskrit, so callers should
    compare with a space-insensitive similarity.
    """
    text = unicodedata.normalize("NFC", text.lower()).translate(_DIACRITIC_MAP)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    for pattern, replacement in _LOOSE_RULES:
        text = pattern.sub(replacement, text)
    return text.strip()


def devanagari_to_int(numeral: str) -> int:
    return int(numeral.translate(DEVANAGARI_DIGITS))
