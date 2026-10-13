"""Verification of model output against the passages it was given.

Run on every answer before it reaches a user:

* a teaching or related passage whose id was not provided is dropped;
* an inline [[id]] citation marker naming a passage that was not provided is
  removed;
* text the model puts in quotation marks must occur verbatim in one of the
  provided translations; otherwise the quotation marks are removed (the words
  stay, as the model's own wording) so nothing unverified is presented as a
  quotation.

Every change is reported, so the API can show that verification ran and what
it changed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.corpus import Passage
from app.generation.schemas import GuidanceDraft

MAX_TEACHINGS = 4
MAX_STEPS = 6
MAX_RELATED = 3
MAX_FOLLOW_UPS = 3

MARKER = re.compile(r"\[\[\s*([a-z0-9][a-z0-9._-]*)\s*\]\]", re.IGNORECASE)
# Straight or curly double quotes around at least three words.
_QUOTE = re.compile(r"[\"“]([^\"“”]{12,}?)[\"”]")


@dataclass
class Verification:
    issues: list[str] = field(default_factory=list)
    cited_ids: list[str] = field(default_factory=list)

    def cite(self, passage_id: str) -> None:
        if passage_id not in self.cited_ids:
            self.cited_ids.append(passage_id)


def _normalize(text: str) -> str:
    text = text.lower().replace("’", "'").replace("—", " ").replace("–", " ")
    text = re.sub(r"[^\w\s']", " ", text)
    return re.sub(r"\s+", " ", text).strip()


class Verifier:
    def __init__(self, allowed: dict[str, Passage]) -> None:
        self.allowed = allowed
        self.haystack = " | ".join(_normalize(p.translation) for p in allowed.values())

    def text(self, value: str | None, report: Verification, where: str) -> str | None:
        if value is None:
            return None

        def marker(match: re.Match[str]) -> str:
            pid = match.group(1).lower()
            if pid in self.allowed:
                report.cite(pid)
                return f"[[{pid}]]"
            report.issues.append(f"{where}: removed citation of {pid}, which was not provided")
            return ""

        value = MARKER.sub(marker, value)

        def quote(match: re.Match[str]) -> str:
            inner = match.group(1)
            if len(inner.split()) < 3 or _normalize(inner) in self.haystack:
                return match.group(0)
            report.issues.append(f"{where}: quotation marks removed from wording not found in the sources")
            return inner

        value = _QUOTE.sub(quote, value)
        return re.sub(r"[ \t]{2,}", " ", value).strip()

    def draft(self, draft: GuidanceDraft) -> tuple[GuidanceDraft, Verification]:
        report = Verification()
        d = draft.model_copy(deep=True)

        teachings = []
        seen: set[str] = set()
        for teaching in d.teachings:
            pid = teaching.passage_id.strip().lower()
            if pid not in self.allowed:
                report.issues.append(f"dropped a teaching citing {pid}, which was not provided")
                continue
            if pid in seen:
                continue
            seen.add(pid)
            teaching.passage_id = pid
            report.cite(pid)
            for name in (
                "what_it_says",
                "context",
                "interpretation_notes",
                "why_it_applies",
                "application",
                "limits",
            ):
                setattr(teaching, name, self.text(getattr(teaching, name), report, f"{pid}.{name}"))
            teachings.append(teaching)
        if len(teachings) > MAX_TEACHINGS:
            report.issues.append(f"kept the first {MAX_TEACHINGS} of {len(teachings)} teachings")
        d.teachings = teachings[:MAX_TEACHINGS]

        related = []
        for item in d.related:
            pid = item.passage_id.strip().lower()
            if pid not in self.allowed:
                report.issues.append(f"dropped a related passage {pid}, which was not provided")
                continue
            if pid in seen:
                continue
            seen.add(pid)
            item.passage_id = pid
            item.reason = self.text(item.reason, report, f"related.{pid}") or ""
            related.append(item)
        d.related = related[:MAX_RELATED]

        for name in (
            "situation",
            "path_forward_intro",
            "framework",
            "reflective_question",
            "follow_up_message",
            "evidence_note",
            "alternative_readings",
        ):
            setattr(d, name, self.text(getattr(d, name), report, name))
        for step in d.steps:
            step.title = self.text(step.title, report, "step") or ""
            step.detail = self.text(step.detail, report, "step") or ""
        d.steps = d.steps[:MAX_STEPS]
        d.suggested_follow_ups = [q.strip() for q in d.suggested_follow_ups if q.strip()][:MAX_FOLLOW_UPS]

        if d.response_kind == "guidance" and not d.teachings:
            d.response_kind = "insufficient_sources"
            if d.evidence != "limited":
                d.evidence = "limited"
            report.issues.append("no usable teachings remained; marked as insufficient sources")
        return d, report
