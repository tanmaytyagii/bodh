"""Structured outputs requested from the language model.

The model never returns scripture text: it returns passage ids, which the
server resolves to verified records. Field descriptions are part of the JSON
schema the model sees, so they double as instructions.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SafetyCategory = Literal[
    "suicide_or_self_harm",
    "abuse_or_unsafe_home",
    "violence_toward_others",
    "medical_emergency",
    "severe_distress",
    "harm_justification",
    "discrimination",
]


class SafetyAssessment(BaseModel):
    level: Literal["none", "concern", "crisis"] = Field(
        description=(
            "crisis: possible risk to life or safety right now (suicidal thoughts, self-harm, "
            "ongoing abuse, intent to harm someone, medical emergency). concern: serious "
            "distress or risk that does not seem immediate. none: otherwise."
        )
    )
    categories: list[SafetyCategory]
    note: str = Field(description="One short, factual sentence explaining the level.")


class Understanding(BaseModel):
    """Stage 1: what the person is facing, and how to search the texts."""

    language: Literal["en", "hi", "hinglish", "other"]
    request_type: Literal["life_situation", "follow_up", "scripture_question", "out_of_scope"]
    situation_summary: str = Field(
        description="Two or three sentences restating the situation accurately and kindly, "
        "without assuming facts that were not stated."
    )
    core_dilemma: str = Field(description="The underlying tension or decision, in one sentence.")
    emotions: list[str] = Field(description="Feelings the person expressed or clearly implied.")
    clarifying_question: str | None = Field(
        description="Only if one essential fact is missing and any answer would be guesswork; otherwise null."
    )
    search_queries: list[str] = Field(
        description="3 to 5 short English queries describing the principles involved, phrased "
        "to match a 1922 English translation of the Gita."
    )
    concept_ids: list[str] = Field(description="Up to 4 ids from the concept index that fit.")
    safety: SafetyAssessment


class TeachingDraft(BaseModel):
    passage_id: str = Field(description="Exact id of one provided passage, e.g. bg.2.47.")
    what_it_says: str = Field(
        description="Faithful plain-language explanation of what the passage itself says."
    )
    context: str = Field(description="Who is speaking to whom, and the situation in the text at that point.")
    interpretation_notes: str | None = Field(
        description="Translator's notes or commentary - only from material provided with the "
        "passage, attributed. null if none was provided."
    )
    why_it_applies: str = Field(description="Why this passage bears on the person's situation.")
    application: str = Field(
        description="Your own interpretation of how it might apply today, framed as such."
    )
    limits: str = Field(description="What the passage does not imply, and where the analogy breaks down.")


class StepDraft(BaseModel):
    title: str
    detail: str
    timeframe: Literal["today", "this_week", "ongoing"]


class RelatedDraft(BaseModel):
    passage_id: str
    reason: str


class GuidanceDraft(BaseModel):
    """Stage 2: the structured reply."""

    response_kind: Literal["guidance", "follow_up", "clarification", "insufficient_sources"]
    situation: str = Field(description="Section A: understanding the person's situation.")
    teachings: list[TeachingDraft] = Field(description="Sections B-D: the most relevant passages.")
    path_forward_intro: str = Field(description="One or two sentences framing the next steps.")
    steps: list[StepDraft] = Field(description="Section E: concrete, realistic next steps.")
    framework: str | None = Field(
        description="An optional short decision framework, e.g. what is and is not within "
        "the person's control. null if not useful."
    )
    reflective_question: str = Field(description="Section F: one reflective question.")
    follow_up_message: str | None = Field(
        description="For follow-up turns and clarifications: the main reply. null otherwise."
    )
    summary: str | None = Field(
        description="'In short', shown first: two or three sentences (at most 60 words) with the "
        "heart of the person's situation and the main takeaway the passages offer, framed as "
        "interpretation and marked with [[id]] for the passages it rests on. Never a quotation, "
        "and never presented as what a verse literally says. null for follow-up turns and "
        "clarifications."
    )
    related: list[RelatedDraft] = Field(
        description="Up to 3 other provided passages worth reading next, with a reason."
    )
    evidence: Literal["strong", "moderate", "limited"] = Field(
        description="How directly the provided passages speak to this situation."
    )
    evidence_note: str | None = Field(
        description="When evidence is limited or moderate, say what the sources do not cover."
    )
    alternative_readings: str | None = Field(
        description="Competing interpretations that genuinely matter here; null otherwise."
    )
    suggested_follow_ups: list[str] = Field(description="2 or 3 short questions to ask next.")
