"""Isha, Katha and Kena Upanishads: Swami Paramananda's translation (1919).

Public domain (published 1919; the translator died in 1940). The Project
Gutenberg edition (eBook #3283) marks each verse number with a heading; the
verse is the first paragraph after it and Paramananda's commentary follows.
As a guard, every verse paragraph must be wrapped like the verses of this
edition (lines of at most 66 characters; the commentary is set wider).

This edition has no Sanskrit, so these passages carry the translation only
and are marked as not independently checked.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from app.corpus import Citation, Division, Edition, EditionCorrection, Passage, Source, TranslatorNote
from app.ingestion.fetch import SourceCache

EDITION_ID = "paramananda-1919"
CACHE_NAME = "gutenberg-paramananda-upanishads"
URL = "https://www.gutenberg.org/cache/epub/3283/pg3283-images.html"
FILENAME = "pg3283-images.html"

_ROMAN = re.compile(r"^[IVXLC]+$")
_PART = re.compile(r"(?i)^part\s+(first|second|third|fourth|fifth|sixth)$")
_ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6}
_TITLE = re.compile(r"(?i)^(isa|katha|kena)-upanishad$")
MAX_VERSE_LINE = 66

# Transcription errors in the Project Gutenberg text (not in the 1919 book's
# sense), corrected with the transcribed reading recorded on the passage.
_TRANSCRIPTION_FIXES: dict[str, list[tuple[str, str]]] = {
    "katha.1.2": [("yet resected:", "yet reflected:")],
    "katha.1.16": [("great-soured", "great-souled")],
}


@dataclass(frozen=True)
class Text:
    key: str
    source_id: str
    prefix: str
    title: str
    tradition: str
    description: str
    parts: dict[int, int]  # part -> expected verse count
    standard_ref: str  # how verses are conventionally cited


TEXTS = {
    "isa": Text(
        key="isa",
        source_id="isha-upanishad",
        prefix="isha",
        title="Isha Upanishad",
        tradition="Upanishad · Shukla Yajur Veda",
        description=(
            "One of the shortest of the principal Upanishads, eighteen verses in all. It opens "
            "by seeing the whole world as pervaded by the Lord, and asks how one should live and "
            "act in the light of that vision."
        ),
        parts={1: 18},
        standard_ref="{verse}",
    ),
    "katha": Text(
        key="katha",
        source_id="katha-upanishad",
        prefix="katha",
        title="Katha Upanishad",
        tradition="Upanishad · Krishna Yajur Veda",
        description=(
            "The story of the boy Nachiketas, who goes to the house of Death and asks what becomes "
            "of a person after death. Refusing every worldly gift Death offers, he receives the "
            "teaching on the Self, and on choosing the good over the merely pleasant."
        ),
        parts={1: 29, 2: 25, 3: 17, 4: 15, 5: 15, 6: 18},
        standard_ref="{adhyaya}.{valli}.{verse}",
    ),
    "kena": Text(
        key="kena",
        source_id="kena-upanishad",
        prefix="kena",
        title="Kena Upanishad",
        tradition="Upanishad · Sama Veda (Talavakara Brahmana)",
        description=(
            "Named for its first word, kena, “by whom?”: by whom is the mind directed, by "
            "whom do the eye and ear work? A short inquiry into the power behind the senses and "
            "the mind."
        ),
        parts={1: 8, 2: 5, 3: 12, 4: 9},
        standard_ref="{part}.{verse}",
    ),
}

EDITION = Edition(
    id=EDITION_ID,
    source_ids=[text.source_id for text in TEXTS.values()],
    role="primary",
    language="en",
    title="The Upanishads (Isa, Katha, Kena), translated and commentated by Swami Paramananda",
    contributors="Swami Paramananda (translator and commentator); Project Gutenberg eBook #3283",
    year=1919,
    publisher=None,
    license=(
        "Public domain: published in 1919; the translator died in 1940. Project Gutenberg transcription."
    ),
    url="https://www.gutenberg.org/ebooks/3283",
    notes=(
        "English only — the edition does not print the Sanskrit. Each verse is followed by the "
        "translator's commentary, shown here as his notes."
    ),
)


def fetch(cache: SourceCache | None = None, *, refresh: bool = False) -> SourceCache:
    cache = cache or SourceCache(CACHE_NAME)
    cache.get(FILENAME, URL, refresh=refresh)
    return cache


def roman_to_int(numeral: str) -> int:
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
    total = 0
    for i, ch in enumerate(numeral):
        value = values[ch]
        total += -value if i + 1 < len(numeral) and values[numeral[i + 1]] > value else value
    return total


@dataclass
class BuildResult:
    sources: list[Source]
    passages: list[Passage]
    issues: list[str]


def build(cache: SourceCache | None = None) -> BuildResult:
    cache = cache or SourceCache(CACHE_NAME)
    if cache.record(FILENAME) is None:
        raise RuntimeError(f"{FILENAME} has not been fetched. Run the fetch step first.")
    soup = BeautifulSoup(cache.path(FILENAME).read_text(encoding="utf-8"), "html.parser")
    body = soup.body
    assert body is not None

    issues: list[str] = []
    collected: dict[str, dict[int, list[tuple[int, str, list[str], str]]]] = {k: {} for k in TEXTS}
    text_key: str | None = None
    part: int | None = None
    current: tuple[int, list[str], str] | None = None  # (verse, paragraphs, anchor id)

    def flush() -> None:
        nonlocal current
        if current is not None and text_key and part:
            verse, paragraphs, anchor = current
            if paragraphs:
                collected[text_key].setdefault(part, []).append(
                    (verse, paragraphs[0], paragraphs[1:], anchor)
                )
            else:
                issues.append(f"{text_key} {part}.{verse}: no text")
        current = None

    for el in body.find_all(["h1", "h2", "h3", "h4", "h5", "p"]):
        if not isinstance(el, Tag):
            continue
        raw = el.get_text()
        label = raw.strip()
        title = _TITLE.match(label)
        if title:
            flush()
            text_key = title.group(1).lower()
            part = 1 if text_key == "isa" else None
            continue
        if el.name != "p":
            part_match = _PART.match(label)
            if part_match:
                flush()
                part = _ORDINALS[part_match.group(1).lower()]
            elif _ROMAN.match(label) and text_key:
                flush()
                current = (roman_to_int(label), [], "")
            else:
                flush()  # e.g. "OM! PEACE! PEACE! PEACE!" ends a verse's commentary
            continue
        if current is not None:
            verse, paragraphs, anchor = current
            if not paragraphs:
                widths = [len(line.rstrip()) for line in raw.split("\n") if line.strip()]
                if widths and max(widths) > MAX_VERSE_LINE:
                    issues.append(f"{text_key} {part}.{verse}: verse paragraph set like commentary")
                anchor = str(el.get("id") or "")
            paragraphs.append(_squash(raw))
            current = (verse, paragraphs, anchor)
    flush()

    sources: list[Source] = []
    passages: list[Passage] = []
    for key, text in TEXTS.items():
        divisions = []
        position = 0
        for part_no, expected in text.parts.items():
            verses = collected[key].get(part_no, [])
            numbers = [v[0] for v in verses]
            if numbers != list(range(1, expected + 1)):
                issues.append(f"{text.title} part {part_no}: verse numbers {numbers} != 1..{expected}")
            divisions.append(
                Division(
                    number=part_no,
                    title=_part_title(key, part_no),
                    passage_count=len(verses),
                    first_passage_id=f"{text.prefix}.{part_no}.1",
                )
            )
            for verse, body_text, commentary, anchor in verses:
                position += 1
                passages.append(_passage(text, part_no, verse, position, body_text, commentary, anchor))
        sources.append(
            Source(
                id=text.source_id,
                title=text.title,
                title_original=None,
                tradition=text.tradition,
                description=text.description,
                division_label="Part",
                passage_label="Verse",
                sort_order={"isa": 2, "katha": 3, "kena": 4}[key],
                divisions=divisions,
            )
        )
    return BuildResult(sources=sources, passages=passages, issues=issues)


def _part_title(key: str, part: int) -> str | None:
    if key == "isa":
        return None
    if key == "katha":
        return f"Chapter {1 if part <= 3 else 2}, section {part if part <= 3 else part - 3}"
    return None


def _standard_ref(text: Text, part: int, verse: int) -> str:
    if text.key == "katha":
        adhyaya, valli = (1, part) if part <= 3 else (2, part - 3)
        return f"{adhyaya}.{valli}.{verse}"
    if text.key == "isa":
        return str(verse)
    return f"{part}.{verse}"


def _passage(
    text: Text, part: int, verse: int, position: int, body: str, commentary: list[str], anchor: str
) -> Passage:
    standard = _standard_ref(text, part, verse)
    page = f"Part {part}, verse {verse}" if text.key != "isa" else f"verse {verse}"
    passage_id = f"{text.prefix}.{part}.{verse}"
    corrections = []
    for wrong, right in _TRANSCRIPTION_FIXES.get(passage_id, []):
        if wrong in body:
            body = body.replace(wrong, right)
            corrections.append(
                EditionCorrection(
                    field="translation",
                    printed=wrong,
                    corrected=right,
                    applied=True,
                    basis="Obvious transcription error in the Project Gutenberg text.",
                )
            )
    return Passage(
        id=passage_id,
        source_id=text.source_id,
        kind="verse",
        ref=f"{text.title} {standard}",
        path=f"{part}/{verse}",
        position=position,
        division={"chapter": part, "verse": verse},
        division_title=_part_title(text.key, part),
        speaker=None,
        sanskrit=None,
        transliteration=None,
        translation=body,
        translation_edition_id=EDITION_ID,
        translator_notes=[TranslatorNote(anchor=None, text=p) for p in commentary],
        corrections=corrections,
        citation=Citation(
            edition_id=EDITION_ID,
            label=f"Swami Paramananda (tr.), The Upanishads (1919), {text.title}, {page}",
            url=f"{URL}#{anchor}" if anchor else URL,
            scan_url=None,
            page=None,
        ),
        provenance_status="unverified",
        provenance_notes=[
            "English translation only: this edition does not print the Sanskrit, and no second "
            "edition has been compared yet."
        ],
        metadata={"standard_ref": standard, "edition_part": part},
    )


def _squash(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
