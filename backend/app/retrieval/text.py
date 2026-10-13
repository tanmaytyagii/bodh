"""Text processing shared by both storage backends.

Lexical search runs over ASCII-folded English (Besant writes "Bhârata"; users
type "Bharata"), stemmed with the same Snowball English stemmer that
PostgreSQL's `english` text-search configuration uses, so the Postgres and
in-memory backends rank alike.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from py_rust_stemmers import SnowballStemmer

from app.corpus import Concept, Passage
from app.ingestion.normalize import loose_roman, to_iast

_STEMMER = SnowballStemmer("english")

# PostgreSQL's English stopwords plus the archaic forms the 1922 translation
# uses everywhere ("thou", "hath"), which carry no meaning for search.
STOPWORDS = frozenset(
    [
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "could",
        "did",
        "do",
        "does",
        "doing",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "has",
        "have",
        "having",
        "he",
        "her",
        "here",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "itself",
        "just",
        "me",
        "more",
        "most",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "now",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "she",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whom",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
        "thou",
        "thee",
        "thy",
        "thine",
        "ye",
        "hath",
        "doth",
        "art",
        "shalt",
        "wilt",
        "dost",
        "unto",
        "o",
        "oh",
        "also",
        "even",
        "verily",
        "get",
        "got",
        "feel",
        "feeling",
        "felt",
        "really",
        "much",
        "many",
        "lot",
        "lots",
        "im",
        "ive",
        "dont",
        "cant",
        "wont",
        "didnt",
        "doesnt",
        "isnt",
        "keep",
        "keeps",
        "kept",
        "like",
        "one",
        "ones",
        "thing",
        "things",
        "way",
        "something",
        "someone",
        "want",
        "wants",
        "know",
        "make",
        "made",
        "go",
        "going",
        "say",
        "said",
        "tell",
        "told",
        "think",
        "thought",
    ]
)

# Modern words people type → words Besant's 1922 translation actually uses.
# Applied to lexical queries only; semantic search does not need it.
SYNONYMS: dict[str, tuple[str, ...]] = {}


def _syn(words: str, targets: str) -> None:
    for word in words.split():
        SYNONYMS[word] = tuple(targets.split())


_syn("anxious anxiety worry worried worrying stress stressed tension nervous", "anxiety fear troubled")
_syn("fail failing failed failure failures rejection rejected reject lose losing", "failure defeat loss")
_syn("success succeed successful win winning", "success victory gain")
_syn("result results outcome outcomes marks grades score", "fruit fruits result")
_syn("job career work office placement placements interview interviews exam exams", "action work duty")
_syn("duty responsibility responsibilities obligation obligations", "duty action")
_syn("jealous jealousy envy envious compare comparing comparison", "envy envious malice")
_syn("angry anger rage furious irritated frustrated frustration revenge", "wrath anger passion")
_syn("hate hatred resent resentment grudge", "hatred ill-will aversion malice")
_syn(
    "sad sadness depressed depression hopeless despair grief grieving mourning",
    "grief sorrow despondency dejection",
)
_syn("death die died dying dead", "death dead slain")
_syn("fear afraid scared panic terrified", "fear fearlessness")
_syn(
    "confused confusion doubt doubts unsure uncertain indecisive dilemma",
    "doubt delusion confused bewildered",
)
_syn("lazy laziness procrastinate procrastinating procrastination", "indolence sloth heedlessness")
_syn("focus concentrate concentration distracted distraction overthinking", "mind restless one-pointed")
_syn("calm peace peaceful relax", "peace balanced equilibrium")
_syn("ego pride proud arrogance arrogant", "egoism pride arrogance conceit")
_syn("greed greedy money wealth rich richer wealthy covet coveting", "greed wealth covet")
_syn("desire craving crave lust addiction addicted temptation", "desire desires longing lust attachment")
_syn("cling clinging attached", "attachment")
_syn("friend friends friendship", "friend friendly")
_syn("enemy enemies betray betrayal betrayed backstab", "foe enemy ill-will")
_syn("forgive forgiving forgiveness", "forgiveness forgiving")
_syn("family parents father mother brother sister relatives", "kinsmen family")
_syn("leader leadership manager team boss", "example standard welfare")
_syn("quit quitting escape", "relinquish abandon renunciation")
_syn("discipline disciplined self-control willpower", "self-control restrained controlled subdued")
_syn("sleep tired exhausted burnout overwork", "sleep regulated wakefulness")
_syn("honest honesty lie lying lies", "truth truthful")
_syn("happy happiness joy pleasure fun", "pleasure happiness joy pleasant")
_syn("long-term longterm", "good pleasant end")
_syn("pain suffering hurt hurting", "pain suffering sorrow")
_syn("pray prayer god faith", "devotion faith worship")
_syn("worthless insecure insecurity confidence", "self depressed faith")
_syn("courage brave bold", "courage fearlessness steadfast")
_syn("patience patient endure tolerate", "endure patience forgiveness")
_syn("humble humility", "humility modesty")
_syn("mentor guru teacher", "teacher discipleship wise")
_syn("learn learning knowledge", "wisdom knowledge")


# Hindi (Devanagari) and Hinglish words → English keys above. Lets the lexical
# channel work for questions written in Hindi or code-mixed Hinglish when no
# language model is available to translate them. Matching is by exact token.
CROSS_LINGUAL: dict[str, str] = {}


def _xl(words: str, english: str) -> None:
    for word in unicodedata.normalize("NFC", words).split():
        CROSS_LINGUAL[word] = english


_xl("gussa gussaa gusse krodh गुस्सा गुस्से क्रोध", "anger")
_xl("jalan irshya irsha जलन ईर्ष्या", "envy")
_xl("dar darr darta darti bhay डर भय डरता डरती", "fear")
_xl("chinta tension tensed pareshan pareshaan चिंता तनाव परेशान", "anxiety")
_xl("dukh dukhi udaas udas khaali khali दुख दुःख दुखी उदास", "grief")
_xl("maut mrityu मृत्यु देहांत मौत निधन", "death grief")
_xl("yaad", "grief")
_xl("padhai padhayi padhna पढ़ाई पढाई", "study focus")
_xl("naukri kaam नौकरी नौकरियों काम", "job work")
_xl("tayari taiyari तैयारी", "work")
_xl("pariksha परीक्षा", "exam")
_xl("parinaam parinam परिणाम रिजल्ट", "results")
_xl("neend नींद", "sleep")
_xl("dost dosti doston yaar दोस्त दोस्तों मित्र", "friend")
_xl("dhokha dhoka धोखा", "betrayal")
_xl("maafi maaf kshama माफ माफी क्षमा", "forgive")
_xl("ghamand ahankar अहंकार घमंड", "ego")
_xl("lalach lobh लालच लोभ", "greed")
_xl("aalas aalsi alas आलस आलसी", "lazy")
_xl("mann मन", "mind")
_xl("dhyan dhyaan ध्यान", "focus")
_xl("faisla nirnay फैसला निर्णय चुननी चुनना", "decision doubt")
_xl("chhod chod chhodna छोड़ छोड़ना", "quit")
_xl("pyaar pyar prem प्यार प्रेम", "love")
_xl("maa mummy papa pita mata parivaar parivar gharwale माँ माता पिता पापा परिवार", "family")
_xl("bhai behen behan भाई बहन", "family")
_xl("akela akeli akelapan अकेला अकेली", "sad")
_xl("himmat हिम्मत साहस", "courage")
_xl("bharosa vishwas shraddha भरोसा विश्वास श्रद्धा", "faith")
_xl("paisa paise dhan पैसा पैसे धन", "money")
_xl("jhooth jhoot sach झूठ सच", "honest")
_xl("guilt pachtava पछतावा पछताता", "self")
_xl("safalta सफलता", "success")
_xl("asafal असफल फेल", "fail")
_xl("इंटरव्यू", "interview")
_xl("कठिन मुश्किल", "pain")
_syn("overthinking", "doubt mind restless")


def fold_ascii(text: str) -> str:
    """'Bhârata' → 'Bharata'. Keeps only ASCII; used for English search text."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c) and ord(c) < 128)


_WORD = re.compile(r"[a-z]+(?:-[a-z]+)?")
_DEVANAGARI_WORD = re.compile("[\u0900-\u0963\u0966-\u097f]+")


def tokenize(text: str) -> list[str]:
    return _WORD.findall(fold_ascii(text).lower())


def stem(word: str) -> str:
    return str(_STEMMER.stem_word(word))


def keywords(text: str, *, expand: bool = True) -> list[str]:
    """Content words of a query, plus vocabulary of the translation they map to."""
    out: list[str] = []
    seen: set[str] = set()

    def add(word: str) -> None:
        if word not in seen and word not in STOPWORDS and len(word) > 1:
            seen.add(word)
            out.append(word)

    def expand_word(word: str) -> None:
        add(word)
        if expand:
            for synonym in SYNONYMS.get(word, ()):
                for piece in synonym.split("-"):
                    add(piece)

    for token in tokenize(text):
        for part in token.split("-"):
            if part in CROSS_LINGUAL:
                for english in CROSS_LINGUAL[part].split():
                    expand_word(english)
            else:
                expand_word(part)
    if expand:
        for token in _DEVANAGARI_WORD.findall(unicodedata.normalize("NFC", text)):
            for english in CROSS_LINGUAL.get(token, "").split():
                expand_word(english)
    return out


def stems(words: Iterable[str]) -> list[str]:
    return [stem(word) for word in words if word not in STOPWORDS]


# --------------------------------------------------------------------------
# Representations of a passage
# --------------------------------------------------------------------------


def search_fields(passage: Passage, concepts: dict[str, Concept]) -> tuple[str, str]:
    """(primary, secondary) English text for full-text search.

    Primary is the translation itself. Secondary adds the translator's notes, the
    chapter title and the names and life situations of the editorial concepts
    linked to the passage, at lower weight.
    """
    primary = fold_ascii(passage.translation)
    parts = [note.text for note in passage.translator_notes]
    if passage.division_title:
        parts.append(passage.division_title)
    for concept_id in passage.metadata.get("concepts", []):
        concept = concepts.get(concept_id)
        if concept:
            parts.append(concept.name)
            parts.extend(concept.life_situations)
    return primary, fold_ascii(" ".join(parts))


def embedding_text(passage: Passage, concepts: dict[str, Concept], *, themes: bool = False) -> str:
    """The text whose embedding represents a passage in semantic search.

    Appending editorial theme names helps some models (bge) and hurts others
    (e5) on the evaluation set, so it is a setting (EMBEDDING_WITH_THEMES).
    """
    text = passage.translation
    names = [concepts[c].name for c in passage.metadata.get("concepts", []) if c in concepts]
    if themes and names:
        text += " Themes: " + "; ".join(names) + "."
    return text


def concept_document(concept: Concept) -> str:
    """Text used to match a user's situation to an editorial concept."""
    return f"{concept.name}. {concept.summary} Situations: {'; '.join(concept.life_situations)}."


def roman_key(passage: Passage) -> str:
    """Space-free loose romanization of a verse, for fuzzy Sanskrit matching."""
    if not passage.transliteration:
        return ""
    return loose_roman(passage.transliteration).replace(" ", "")


_DEVANAGARI = re.compile("[\u0900-\u097f]")


def query_roman_key(query: str) -> str:
    """Loose romanization of a query that may be IAST, casual romanization or
    Devanagari ("karmanye vadhikaraste", "कर्मण्येवाधिकारस्ते")."""
    if _DEVANAGARI.search(query):
        query = to_iast(query)
    return loose_roman(query).replace(" ", "")
