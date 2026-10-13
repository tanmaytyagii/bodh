"""Bhagavad Gita: Annie Besant's translation, 4th edition (1922).

This edition prints the Devanagari text of each verse alongside the English,
so one public-domain book supplies both, already aligned. We use the
proofread transcription on English Wikisource, which also links every page of
text to its scan — citations can point at the exact printed page.

Parsing strategy: the rendered HTML is linearized into a token stream (page
breaks, verse markers, footnote references, transcribers' [sic] notes,
centred lines), then Sanskrit and English verses are collected separately and
paired by position. Verse numbers come from the Sanskrit markers, which are
complete; misprinted English verse numbers are recorded, not trusted.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from urllib.parse import quote

from bs4 import BeautifulSoup, NavigableString, Tag

from app.corpus import (
    Citation,
    Division,
    Edition,
    EditionCorrection,
    Passage,
    Source,
    TranslatorNote,
)
from app.ingestion.fetch import SourceCache
from app.ingestion.normalize import clean_devanagari, devanagari_to_int, to_iast

SOURCE_ID = "bhagavad-gita"
EDITION_ID = "besant-1922"
CACHE_NAME = "wikisource-besant-gita"
WIKISOURCE = "https://en.wikisource.org/wiki/"
BOOK_PAGE = "Bhagavad-Gita_(Besant_4th)"
_API = "https://en.wikisource.org/w/api.php?action=parse&format=json&formatversion=2&prop=text%7Crevid&page="

# Verses per chapter in this edition. Chapter 13 has 35: the edition includes
# the opening verse ("prakṛtiṃ puruṣaṃ caiva ...") that some editions omit.
EXPECTED_VERSES = {
    1: 47,
    2: 72,
    3: 43,
    4: 42,
    5: 29,
    6: 47,
    7: 30,
    8: 28,
    9: 34,
    10: 42,
    11: 55,
    12: 20,
    13: 35,
    14: 27,
    15: 20,
    16: 24,
    17: 28,
    18: 78,
}

SPEAKERS_SA = {
    "धृतराष्ट्र उवाच": "Dhritarashtra",
    "सञ्जय उवाच": "Sanjaya",
    "अर्जुन उवाच": "Arjuna",
    "श्रीभगवानुवाच": "Krishna",
}
_SPEAKER_EN = re.compile(r"^(The Blessed Lord|Arjuna|Sanjaya|Dhritar[aâ]shtra) said:\s*", re.IGNORECASE)

# Transcribers' [sic] suggestions we deliberately do not apply to the English,
# because the printed form is correct archaic usage rather than a misprint.
_KEEP_PRINTED_EN = {"divers"}

# Misprints in the printed text that Wikisource did not mark, corrected here.
_EDITORIAL_TITLE_FIXES = {"INDESCTRUCTIBLE": "INDESTRUCTIBLE"}

EDITION = Edition(
    id=EDITION_ID,
    source_ids=[SOURCE_ID],
    role="primary",
    language="sa, en",
    title="The Bhagavad-Gita, or The Lord's Song (4th edition), with the Devanagari text",
    contributors="Annie Besant (translator); transcribed and proofread by Wikisource volunteers",
    year=1922,
    publisher="G. A. Natesan & Co., Madras",
    license=(
        "Public domain. The Sanskrit text is ancient; Besant's translation is in the "
        "public domain (translator died 1933). Wikisource transcription of a "
        "public-domain work."
    ),
    url=WIKISOURCE + BOOK_PAGE,
    notes=(
        "Sanskrit and English are printed side by side in this edition. Obvious "
        "misprints marked [sic] by Wikisource transcribers are corrected; every "
        "correction is recorded with the printed reading."
    ),
)

SOURCE = Source(
    id=SOURCE_ID,
    title="Bhagavad Gita",
    title_original="श्रीमद्भगवद्गीता",
    tradition="Itihāsa · part of the Bhishma Parva of the Mahabharata",
    description=(
        "A dialogue on the battlefield of Kurukshetra in which Krishna counsels "
        "Arjuna, who is overcome by grief and doubt about his duty. Its teachings on "
        "action without attachment to results, steadiness of mind, devotion and "
        "self-knowledge are among the most widely read in Indian philosophy."
    ),
    division_label="Chapter",
    passage_label="Verse",
    sort_order=1,
)


def discourse_url(chapter: int) -> str:
    return f"{WIKISOURCE}{BOOK_PAGE}/Discourse_{chapter}"


def fetch(cache: SourceCache | None = None, *, refresh: bool = False) -> SourceCache:
    cache = cache or SourceCache(CACHE_NAME, min_interval=4.0)
    for chapter in EXPECTED_VERSES:
        page = quote(f"{BOOK_PAGE}/Discourse_{chapter}", safe="()/_")
        cache.get(f"discourse-{chapter:02d}.json", _API + page, refresh=refresh)
    return cache


# --------------------------------------------------------------------------
# Linearization
# --------------------------------------------------------------------------

# Private-use characters delimit tokens embedded in the linear text.
_T0, _T1 = "\ue000", "\ue001"
_TOKEN = re.compile(f"{_T0}(\\w+):(.*?){_T1}", re.S)


def _tok(kind: str, value: str) -> str:
    return f"{_T0}{kind}:{value}{_T1}"


@dataclass
class _Sic:
    printed: str
    corrected: str | None  # None when the transcriber flagged without a suggestion


def _linearize(html: str) -> tuple[str, dict[str, str], list[_Sic]]:
    soup = BeautifulSoup(html, "html.parser")
    for el in soup.find_all(["style", "link"]):
        el.decompose()

    notes: dict[str, str] = {}
    for li in soup.select("ol.references > li"):
        text_el = li.select_one(".reference-text")
        if li.get("id") and text_el is not None:
            notes[str(li["id"])] = _squash(text_el.get_text(" "))
    for refs in soup.select("ol.references"):
        refs.decompose()

    # The book's text is the ProofreadPage output; everything else on the
    # page (navigation header, layout switcher) is Wikisource chrome.
    book = BeautifulSoup("<div></div>", "html.parser")
    container = book.div
    assert container is not None
    for part in soup.select("div.prp-pages-output"):
        container.append(part.extract())
    soup = book

    # Verse numbers first: a misprinted number carries its own [sic] tooltip,
    # and tokens must not nest. Value is "printed|corrected".
    for span in soup.select("span.wst-floatright"):
        printed = span.get_text()
        corrected = printed
        for tip in span.select("span.wst-tooltip"):
            match = re.match(r"\[sic\]\s*'(.*)'\s*$", str(tip.get("title") or ""), re.S)
            if match:
                corrected = corrected.replace(tip.get_text(), match.group(1), 1) or match.group(1)
        span.replace_with(NavigableString(_tok("VNUM", f"{_squash(printed)}|{_squash(corrected)}")))

    sics: list[_Sic] = []
    for span in soup.select("span.wst-tooltip"):
        title = str(span.get("title") or "")
        match = re.match(r"\[sic\]\s*'(.*)'\s*$", title, re.S)
        sics.append(_Sic(printed=span.get_text(), corrected=match.group(1) if match else None))
        span.replace_with(NavigableString(_tok("SIC", str(len(sics) - 1))))

    for sup in soup.select("sup.reference"):
        link = sup.find("a")
        target = str(link.get("href", "")).lstrip("#") if isinstance(link, Tag) else ""
        sup.replace_with(NavigableString(_tok("NOTE", target)))

    for span in soup.select("span.pagenum"):
        number = str(span.get("data-page-number") or "")
        name = str(span.get("data-page-name") or "")
        span.replace_with(NavigableString(_tok("PAGE", f"{number}|{name}")))

    for div in soup.select("div.wst-lang"):
        if div.get("lang") == "sa":
            div.insert(0, NavigableString(_tok("SA", "start")))
            div.append(NavigableString(_tok("SA", "end")))
    for div in soup.select("div.wst-center"):
        div.insert(0, NavigableString(_tok("CENTER", "start")))
        div.append(NavigableString(_tok("CENTER", "end")))
    for p in soup.find_all("p"):
        p.append(NavigableString("\n"))
    for br in soup.find_all("br"):
        br.replace_with(NavigableString("\n"))

    return soup.get_text(), notes, sics


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------


@dataclass
class _Piece:
    """Text collected for one verse, with the tokens that occurred inside it."""

    text: str = ""
    notes: list[tuple[str, str]] = field(default_factory=list)  # (anchor, note id)
    sics: list[int] = field(default_factory=list)
    pages: list[tuple[str, str]] = field(default_factory=list)


@dataclass
class _SanskritVerse:
    number: int
    text: str
    speakers: list[str]  # usually one; two when the speaker changes mid-verse
    speaker_marker: bool
    sics: list[int]
    pages: list[tuple[str, str]]


@dataclass
class _EnglishVerse:
    marker: str
    printed_marker: str
    text: str
    speaker_label: str | None
    notes: list[tuple[str, str]]
    sics: list[int]
    pages: list[tuple[str, str]]


@dataclass
class ChapterParse:
    chapter: int
    sanskrit: list[_SanskritVerse]
    english: list[_EnglishVerse]
    notes: dict[str, str]
    sics: list[_Sic]
    title_en: str | None
    title_sa: str | None
    title_corrections: list[EditionCorrection]
    leftovers: list[str]


def parse_chapter(html: str, chapter: int) -> ChapterParse:
    linear, notes, sics = _linearize(html)

    sanskrit: list[_SanskritVerse] = []
    english: list[_EnglishVerse] = []
    leftovers: list[str] = []
    title_corrections: list[EditionCorrection] = []
    title_en: str | None = None
    title_sa: str | None = None

    in_sa = 0
    in_center = 0
    center_text = ""
    current_page: tuple[str, str] | None = None
    speaker: str | None = None
    verse_speakers: list[str] = []
    speaker_pending = False
    en_speaker_label: str | None = None
    expect_title = False
    sa = _Piece()
    en = _Piece()

    def add_text(piece: _Piece, chunk: str) -> None:
        if chunk.strip() and not piece.pages and current_page:
            piece.pages.append(current_page)
        piece.text += chunk

    def take_title(line: str) -> None:
        nonlocal title_en
        fixed = line
        for wrong, right in _EDITORIAL_TITLE_FIXES.items():
            if wrong in fixed:
                fixed = fixed.replace(wrong, right)
                title_corrections.append(
                    EditionCorrection(
                        field="division_title",
                        printed=line,
                        corrected=fixed,
                        applied=True,
                        basis="Obvious misprint, corrected by the project editors.",
                    )
                )
        title_en = _title_case(fixed.rstrip("."))

    def finish_colophon(piece: _Piece) -> None:
        nonlocal title_sa
        title_sa = _colophon_title(_resolve_sics(piece.text, sics, prefer="corrected"))
        for index in _sic_indices(piece.text):
            sic = sics[index]
            if sic.corrected:
                title_corrections.append(
                    EditionCorrection(
                        field="division_title",
                        printed=sic.printed,
                        corrected=sic.corrected,
                        applied=True,
                        basis="Marked [sic] by Wikisource transcribers.",
                    )
                )

    def cut_sanskrit_verses() -> None:
        """Move every complete verse ("... ॥ N ॥") out of the Sanskrit buffer."""
        nonlocal sa, speaker_pending
        while True:
            body = sa.text
            if _is_colophon(body):
                return  # chapter colophon; finished when its block closes
            verse_end = re.search(r"॥\s*([०-९]+)\s*॥", body)
            if not verse_end:
                return
            verse_text, rest = body[: verse_end.end()], body[verse_end.end() :]
            sanskrit.append(
                _SanskritVerse(
                    number=devanagari_to_int(verse_end.group(1)),
                    text=verse_text,
                    speakers=list(verse_speakers) or ([speaker] if speaker else []),
                    speaker_marker=speaker_pending,
                    sics=[i for i in sa.sics if _tok("SIC", str(i)) in verse_text],
                    pages=list(sa.pages),
                )
            )
            speaker_pending = False
            verse_speakers[:] = [speaker] if speaker else []
            remaining = _Piece(sics=[i for i in sa.sics if _tok("SIC", str(i)) in rest])
            add_text(remaining, rest)
            sa = remaining

    pos = 0
    for match in _TOKEN.finditer(linear + _tok("EOF", "")):
        chunk = linear[pos : match.start()]
        pos = match.end()
        kind, value = match.group(1), match.group(2)

        if chunk:
            if in_center:
                center_text += chunk
            elif in_sa:
                add_text(sa, chunk)
                cut_sanskrit_verses()
            else:
                # A Sanskrit line occasionally sits outside the Sanskrit block
                # (e.g. the first half of 1.28, at the foot of a page).
                for line in chunk.splitlines(keepends=True):
                    if _is_devanagari_line(line):
                        add_text(sa, line)
                        cut_sanskrit_verses()
                    else:
                        add_text(en, line)
                # The English colophon ("Thus in the glorious Upanishads ...,
                # entitled:") ends the verses; the title follows, centred.
                plain = _strip_tokens(en.text).strip()
                if plain.startswith("Thus in the") and "entitled" in plain:
                    expect_title = True
                    en = _Piece()

        if kind == "SA":
            in_sa += 1 if value == "start" else -1
            if value == "end" and in_sa == 0:
                if _is_colophon(sa.text):
                    finish_colophon(sa)
                    sa = _Piece()
                elif _is_end_matter(sa.text):
                    sa = _Piece()

        elif kind == "CENTER":
            if value == "start":
                in_center += 1
                center_text = ""
                continue
            in_center -= 1
            raw_line = center_text
            line = _squash(_resolve_sics(center_text, sics, prefer="corrected"))
            center_text = ""
            if not line:
                continue
            if line.startswith("इति श्रीमद्भगवद्गीता"):
                finish_colophon(_Piece(text=raw_line))
            elif _is_end_matter(raw_line):
                pass
            elif in_sa:
                name = SPEAKERS_SA.get(line.rstrip(" ।").strip())
                if name:
                    if _strip_tokens(sa.text).strip() and speaker:
                        # The speaker changes inside a verse.
                        verse_speakers.append(name)
                    else:
                        verse_speakers[:] = [name]
                        speaker_pending = True
                    speaker = name
                else:
                    leftovers.append(f"centred Sanskrit line: {line}")
            elif _SPEAKER_EN.match(line):
                if _strip_tokens(en.text).strip():
                    # Speaker changes mid-verse: keep the label where it is printed.
                    en.text += f" {line} "
                else:
                    en_speaker_label = line.rstrip(":")
            elif line.startswith("Thus in the"):
                expect_title = "entitled" in line
            elif expect_title and line.isupper():
                take_title(line)
                expect_title = False
            # Other centred lines are headings ("SECOND DISCOURSE.") or end
            # matter and carry no verse text.

        elif kind == "SIC":
            if in_center:
                center_text += match.group(0)
            elif in_sa:
                sa.sics.append(int(value))
                add_text(sa, match.group(0))
            else:
                en.sics.append(int(value))
                add_text(en, match.group(0))

        elif kind == "NOTE":
            if not in_sa and not in_center:
                en.notes.append((_anchor_before(en.text), value))

        elif kind == "PAGE":
            number, _, name = value.partition("|")
            current_page = (number, name)
            for piece in (sa, en):
                if piece.text.strip() and current_page not in piece.pages:
                    piece.pages.append(current_page)

        elif kind == "VNUM":
            printed, _, corrected = value.partition("|")
            if _strip_tokens(en.text).strip():
                english.append(
                    _EnglishVerse(
                        marker=corrected or printed,
                        printed_marker=printed,
                        text=en.text,
                        speaker_label=en_speaker_label,
                        notes=en.notes,
                        sics=en.sics,
                        pages=en.pages,
                    )
                )
            else:
                leftovers.append(f"verse marker {value!r} with no English text")
            en = _Piece()
            en_speaker_label = None

        if kind == "EOF":
            break

    if _strip_tokens(en.text).strip():
        leftovers.append(f"trailing English text: {_squash(_strip_tokens(en.text))[:160]}")
    if _strip_tokens(sa.text).strip():
        leftovers.append(f"trailing Sanskrit text: {_squash(_strip_tokens(sa.text))[:160]}")

    return ChapterParse(
        chapter=chapter,
        sanskrit=sanskrit,
        english=english,
        notes=notes,
        sics=sics,
        title_en=title_en,
        title_sa=title_sa,
        title_corrections=title_corrections,
        leftovers=leftovers,
    )


def _resolve_sics(text: str, sics: list[_Sic], *, prefer: str) -> str:
    def repl(match: re.Match[str]) -> str:
        if match.group(1) != "SIC":
            return match.group(0)
        sic = sics[int(match.group(2))]
        if prefer == "corrected" and sic.corrected is not None:
            return sic.corrected
        return sic.printed

    return _TOKEN.sub(repl, text)


def _strip_tokens(text: str) -> str:
    return _TOKEN.sub("", text)


def _anchor_before(text: str) -> str:
    plain = _strip_tokens(text)
    words = re.findall(r"[\w\-'’âîûÂÎÛ]+", plain)
    return words[-1] if words else ""


_SMALL_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "between",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
}


def _title_case(text: str) -> str:
    words = text.lower().split()
    out = []
    for i, word in enumerate(words):
        if i > 0 and word in _SMALL_WORDS:
            out.append(word)
        else:
            out.append("-".join(part[:1].upper() + part[1:] for part in word.split("-")))
    return " ".join(out)


def _is_devanagari_line(line: str) -> bool:
    plain = _strip_tokens(line)
    devanagari = len(re.findall("[\u0900-\u097f]", plain))
    latin = len(re.findall("[A-Za-z]", plain))
    return devanagari > 3 and latin == 0


def _is_colophon(text: str) -> bool:
    return _strip_tokens(text).strip().startswith("इति श्रीमद्भगवद्गीता")


# Benedictions printed after the last chapter; not part of any verse.
_END_MATTER = ("श्रीकृष्णार्पणमस्तु", "शुभं भवतु")


def _is_end_matter(text: str) -> bool:
    plain = re.sub(r"[\s।॥]", "", _strip_tokens(text))
    patterns = "|".join(re.sub(r"\s", "", item) for item in _END_MATTER)
    return bool(plain) and not re.sub(patterns, "", plain)


def _sic_indices(text: str) -> list[int]:
    return [int(m.group(2)) for m in _TOKEN.finditer(text) if m.group(1) == "SIC"]


def _colophon_title(colophon: str) -> str | None:
    """Extract the chapter name from a colophon.

    '... साङ्ख्ययोगो नाम द्वितीयोऽध्यायः' → 'साङ्ख्ययोग'. When the name is
    joined to the previous word by sandhi (संवादेऽर्जुनविषादयोगो), the elided
    initial अ is restored: → 'अर्जुनविषादयोग'.
    """
    text = clean_devanagari(_strip_tokens(colophon))
    match = re.search(r"(\S+?)ो\s*नाम", text)
    if not match:
        return None
    word = match.group(1)
    if "ऽ" in word:
        word = "अ" + word.rsplit("ऽ", 1)[1]
    return word


# --------------------------------------------------------------------------
# Records
# --------------------------------------------------------------------------


@dataclass
class BuildResult:
    passages: list[Passage]
    divisions: list[Division]
    issues: list[str]


def build(cache: SourceCache | None = None) -> BuildResult:
    cache = cache or SourceCache(CACHE_NAME)
    passages: list[Passage] = []
    divisions: list[Division] = []
    issues: list[str] = []
    position = 0

    for chapter, expected in EXPECTED_VERSES.items():
        filename = f"discourse-{chapter:02d}.json"
        record = cache.record(filename)
        if record is None:
            raise RuntimeError(f"{filename} has not been fetched. Run the fetch step first.")
        html = json.loads(cache.path(filename).read_text(encoding="utf-8"))["parse"]["text"]
        parsed = parse_chapter(html, chapter)
        issues += [f"{chapter}: {item}" for item in parsed.leftovers]

        numbers = [v.number for v in parsed.sanskrit]
        if numbers != list(range(1, expected + 1)):
            issues.append(f"{chapter}: Sanskrit verse numbers are not 1..{expected}: {numbers}")
        if len(parsed.english) != len(parsed.sanskrit):
            issues.append(
                f"{chapter}: {len(parsed.sanskrit)} Sanskrit verses but "
                f"{len(parsed.english)} English verses; cannot pair them safely"
            )
            continue

        divisions.append(
            Division(
                number=chapter,
                title=parsed.title_en,
                title_original=parsed.title_sa,
                passage_count=len(parsed.sanskrit),
                first_passage_id=f"bg.{chapter}.1",
                corrections=parsed.title_corrections,
            )
        )
        for sa_verse, en_verse in zip(parsed.sanskrit, parsed.english, strict=True):
            position += 1
            passages.append(_make_passage(chapter, position, sa_verse, en_verse, parsed, record.url))

    return BuildResult(passages=passages, divisions=divisions, issues=issues)


def _make_passage(
    chapter: int,
    position: int,
    sa: _SanskritVerse,
    en: _EnglishVerse,
    parsed: ChapterParse,
    fetched_from: str,
) -> Passage:
    verse = sa.number
    corrections: list[EditionCorrection] = []
    notes_out: list[str] = []

    # --- Sanskrit -----------------------------------------------------------
    for index in sa.sics:
        sic = parsed.sics[index]
        corrections.append(
            EditionCorrection(
                field="sanskrit",
                printed=sic.printed,
                corrected=sic.corrected if sic.corrected is not None else sic.printed,
                applied=sic.corrected is not None,
                basis="Marked [sic] by Wikisource transcribers.",
            )
        )
    sanskrit_lines = clean_devanagari(_resolve_sics(sa.text, parsed.sics, prefer="corrected"))

    # --- English ------------------------------------------------------------
    text = en.text
    for index in en.sics:
        sic = parsed.sics[index]
        printed, corrected = sic.printed, sic.corrected
        token = _tok("SIC", str(index))
        speaker_fix = corrected and _SPEAKER_EN.match(corrected) and not _SPEAKER_EN.match(printed)
        if speaker_fix and corrected is not None:
            # The printed book omits a speaker label; speakers are shown from
            # the Sanskrit markers, so the label is not added to the text.
            remainder = _SPEAKER_EN.sub("", corrected)
            text = text.replace(token, remainder if printed.strip() else "")
            corrections.append(
                EditionCorrection(
                    field="speaker",
                    printed=printed or "(missing)",
                    corrected=corrected,
                    applied=True,
                    basis="Marked [sic] by Wikisource transcribers; speaker shown from the Sanskrit text.",
                )
            )
        elif corrected is None or printed.strip().lower() in _KEEP_PRINTED_EN:
            text = text.replace(token, printed)
            corrections.append(
                EditionCorrection(
                    field="translation",
                    printed=printed,
                    corrected=corrected or printed,
                    applied=False,
                    basis=(
                        "Flagged [sic] by Wikisource transcribers; printed reading kept"
                        + (" (correct archaic usage)." if corrected else " (no correction suggested).")
                    ),
                )
            )
        else:
            text = text.replace(token, corrected)
            corrections.append(
                EditionCorrection(
                    field="translation",
                    printed=printed,
                    corrected=corrected,
                    applied=True,
                    basis="Marked [sic] by Wikisource transcribers.",
                )
            )
    translation = _squash(_strip_tokens(text))

    if en.printed_marker != f"({verse})":
        corrections.append(
            EditionCorrection(
                field="verse_number",
                printed=en.printed_marker or "(missing)",
                corrected=f"({verse})",
                applied=True,
                basis=(
                    "English verse number misprinted or missing in the 1922 printing; "
                    "numbering follows the Sanskrit text."
                ),
            )
        )

    translator_notes = [
        TranslatorNote(anchor=anchor or None, text=parsed.notes[note_id])
        for anchor, note_id in en.notes
        if note_id in parsed.notes
    ]
    missing_notes = [note_id for _, note_id in en.notes if note_id not in parsed.notes]
    if missing_notes:
        notes_out.append(f"Footnote text not found for {missing_notes}.")

    pages = _dedupe(sa.pages + en.pages)
    page_label = None
    scan_url = None
    if pages:
        numbers = [p[0] for p in pages if p[0]]
        if numbers:
            page_label = numbers[0] if len(numbers) == 1 else f"{numbers[0]}–{numbers[-1]}"
        # Link the scan page where the English begins - the text readers check;
        # the label still gives the full page range.
        scan_page = en.pages[0] if en.pages else pages[0]
        scan_url = WIKISOURCE + quote(scan_page[1].replace(" ", "_"), safe="/:_().-")

    label = f"Annie Besant (tr.), The Bhagavad-Gita, 4th ed. (1922), Discourse {chapter}, verse {verse}"
    if page_label:
        label += f", p. {page_label}"

    return Passage(
        id=f"bg.{chapter}.{verse}",
        source_id=SOURCE_ID,
        kind="verse",
        ref=f"Bhagavad Gita {chapter}.{verse}",
        path=f"{chapter}/{verse}",
        position=position,
        division={"chapter": chapter, "verse": verse},
        division_title=parsed.title_en,
        speaker=sa.speakers[0] if sa.speakers else None,
        sanskrit=sanskrit_lines,
        transliteration=to_iast(sanskrit_lines),
        translation=translation,
        translation_edition_id=EDITION_ID,
        translator_notes=translator_notes,
        corrections=corrections,
        citation=Citation(
            edition_id=EDITION_ID,
            label=label,
            url=discourse_url(chapter),
            scan_url=scan_url,
            page=page_label,
        ),
        provenance_status="unverified",  # set by the cross-check step
        provenance_notes=notes_out,
        metadata={
            "speaker_marker": sa.speaker_marker,
            "speakers": sa.speakers,
            "english_speaker_label": en.speaker_label,
            "chapter_title_original": parsed.title_sa,
            "fetched_from": fetched_from,
        },
    )


def _dedupe(pages: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: list[tuple[str, str]] = []
    for page in pages:
        if page not in seen:
            seen.append(page)
    return seen
