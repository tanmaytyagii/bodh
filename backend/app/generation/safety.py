"""Safety: crisis detection and real-world support resources.

A deterministic keyword check runs before anything else, so a person in crisis
gets help even when no language model is configured or it fails. The model's
own assessment (stage 1) can raise the level further; it cannot lower it.

Helpline details were checked against official and government listings in
October 2026 (see docs/SAFETY.md); review them periodically.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

Level = Literal["none", "concern", "crisis"]
Language = Literal["en", "hi", "hinglish", "other"]


class Resource(BaseModel):
    name: str
    contact: str
    detail: str
    url: str | None = None


TELE_MANAS = Resource(
    name="Tele-MANAS (Government of India)",
    contact="14416 or 1-800-891-4416",
    detail="Free, confidential mental health support, 24×7, in many Indian languages.",
    url="https://telemanas.mohfw.gov.in",
)
EMERGENCY_IN = Resource(
    name="Emergency (India)",
    contact="112",
    detail="Police, ambulance and fire, 24×7. Call if you or someone else is in immediate danger.",
)
WOMEN_HELPLINE = Resource(
    name="Women Helpline (India)",
    contact="181",
    detail="24×7 support for women facing violence at home or elsewhere; connects to police, "
    "shelter, legal and medical help.",
)
CHILD_HELPLINE = Resource(
    name="Childline (India)",
    contact="1098",
    detail="24×7 help for children in difficulty or danger.",
)
VANDREVALA = Resource(
    name="Vandrevala Foundation",
    contact="+91 9999 666 555",
    detail="Free mental health support by phone or WhatsApp.",
)
FIND_A_HELPLINE = Resource(
    name="Outside India",
    contact="findahelpline.com",
    detail="Lists free, confidential helplines by country. In an emergency, call your local "
    "emergency number.",
    url="https://findahelpline.com",
)


def resources_for(categories: list[str]) -> list[Resource]:
    out = [TELE_MANAS, EMERGENCY_IN]
    if "abuse_or_unsafe_home" in categories:
        out += [WOMEN_HELPLINE, CHILD_HELPLINE]
    out += [VANDREVALA, FIND_A_HELPLINE]
    return out


# --------------------------------------------------------------------------
# Deterministic detection
# --------------------------------------------------------------------------

_SELF_HARM = [
    r"\bkill(?:ing)? my ?self\b",
    r"\bend(?:ing)? (?:my|it) (?:life|all)\b",
    r"\bend it all\b",
    r"\btake my (?:own )?life\b",
    r"\bsuicid",
    r"\b(?:don'?t|do not|no longer) want to (?:live|be alive|exist|wake up)\b",
    r"\bwant to die\b",
    r"\bwish i (?:was|were) (?:dead|never born)\b",
    r"\bbetter off (?:dead|without me)\b",
    r"\bno (?:reason|point) (?:to|in) (?:live|living)\b",
    r"\bself[- ]?harm",
    r"\b(?:hurt|hurting|cut|cutting|harm|harming) my ?self\b",
    r"\boverdose\b",
    # Hinglish
    r"\bmarna chaht[aie]\b",
    r"\bmar jaana chaht",
    r"\bjeena nahi chaht",
    r"\bjeene ka (?:mann|man) nahi",
    r"\bjine ka (?:mann|man) nahi",
    r"\bkhud ko (?:khatam|maar)",
    r"\bjaan de (?:doon|dun|du|dunga|dungi)\b",
    r"\bzindagi khatam\b",
    r"\batmahatya\b",
    r"\bkhudkushi\b",
    # Hindi
    "आत्महत्या",
    "खुदकुशी",
    "ख़ुदकुशी",
    "मरना चाहत",
    "जीना नहीं चाहत",
    "जीने का मन नहीं",
    "खुद को खत्म",
    "ख़ुद को ख़त्म",
    "जान दे दूँ",
    "ज़िंदगी खत्म",
    "जिंदगी खत्म",
]

_ABUSE = [
    r"\b(?:hits|hit|beats|beat|slaps|kicks|chokes) me\b",
    r"\b(?:abuses|abused|abusing) me\b",
    r"\b(?:sexually|physically) (?:abused|assaulted)\b",
    r"\bmolest",
    r"\braped?\b",
    r"\bafraid (?:to go|of going) home\b",
    r"\bmujhe (?:maarta|marta|maarti|marti|peet)",
    r"\bmaar ?peet\b",
    "मारपीट",
    "मुझे मारत",
    "मुझे पीटत",
]

_PEOPLE = (
    r"(?:him|her|them|my (?:husband|wife|partner|boyfriend|girlfriend|father|mother|dad|mom|"
    r"brother|sister|son|daughter|boss|manager|coworker|colleague|friend|neighbou?r|teacher|"
    r"roommate|uncle|aunt|in-laws?))"
)
_VIOLENCE = [
    r"\b(?:kill|murder|stab|shoot|poison|beat up) " + _PEOPLE + r"\b",
    r"\bwant to (?:hurt|harm|kill) " + _PEOPLE + r"\b",
    r"\bjaan se maar",
    "जान से मार",
]

_SCRIPTURE = r"\b(?:gita|krishna|scripture|dharma)\b"
_HARM = r"\b(?:kill|hurt|hit|beat|punish|revenge|take revenge)\b"
_PERMIT = r"\b(?:allow\w*|okay|ok|right|justif\w*|permission|says)\b"
_HARM_JUSTIFICATION = [
    _SCRIPTURE + r".{0,80}" + _PERMIT + r".{0,40}" + _HARM,
    _HARM + r".{0,80}" + _SCRIPTURE + r".{0,40}" + _PERMIT,
]


def _compile(patterns: list[str]) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{p})" for p in patterns), re.IGNORECASE | re.DOTALL)


_SELF_HARM_RE = _compile(_SELF_HARM)
_ABUSE_RE = _compile(_ABUSE)
_VIOLENCE_RE = _compile(_VIOLENCE)
_HARM_JUSTIFICATION_RE = _compile(_HARM_JUSTIFICATION)


@dataclass
class SafetySignal:
    level: Level = "none"
    categories: list[str] = field(default_factory=list)

    def raise_to(self, level: Level, categories: list[str]) -> None:
        order = {"none": 0, "concern": 1, "crisis": 2}
        if order[level] > order[self.level]:
            self.level = level
        for category in categories:
            if category not in self.categories:
                self.categories.append(category)


def detect(text: str) -> SafetySignal:
    """Keyword-level safety check. Deliberately errs toward flagging."""
    normalized = unicodedata.normalize("NFC", text)
    signal = SafetySignal()
    if _SELF_HARM_RE.search(normalized):
        signal.raise_to("crisis", ["suicide_or_self_harm"])
    if _ABUSE_RE.search(normalized):
        signal.raise_to("concern", ["abuse_or_unsafe_home"])
    if _VIOLENCE_RE.search(normalized):
        signal.raise_to("concern", ["violence_toward_others"])
    if _HARM_JUSTIFICATION_RE.search(normalized):
        signal.raise_to("concern", ["harm_justification"])
    return signal


_HINGLISH_MARKERS = re.compile(
    r"\b(?:hai|hain|nahi|nahin|mujhe|mera|meri|kya|kar|raha|rahi|hoon|hu|mein|aur|bahut|"
    r"kaise|kyun|lagta|karun|karu|chahta|chahti|tha|thi|ho|gaya|gayi)\b",
    re.IGNORECASE,
)


def guess_language(text: str) -> Language:
    if re.search("[\u0900-\u097f]", text):
        return "hi"
    if len(_HINGLISH_MARKERS.findall(text)) >= 2:
        return "hinglish"
    return "en"


# --------------------------------------------------------------------------
# Static messages (used when the situation calls for real-world help first)
# --------------------------------------------------------------------------

CRISIS_MESSAGE: dict[str, str] = {
    "en": (
        "It sounds like you are carrying something very heavy right now, and it matters that "
        "you said it. You don't have to face this alone. If you are thinking about ending your "
        "life or hurting yourself, please reach out to someone right now - the people at the "
        "numbers below are trained to help and will listen without judgement. If you can, also "
        "tell someone you trust, such as a friend, family member or doctor, what you are going "
        "through.\n\nThis app can't give you the care a trained person can. When you feel ready, "
        "you are welcome to come back and reflect on what the texts say."
    ),
    "hi": (
        "लगता है आप इस समय बहुत भारी बोझ उठा रहे हैं, और आपने यह कहा - यह मायने रखता है। "
        "आपको यह अकेले नहीं सहना है। अगर आपके मन में अपनी जान लेने या खुद को नुकसान पहुँचाने के "
        "विचार आ रहे हैं, तो कृपया अभी किसी से संपर्क करें - नीचे दिए नंबरों पर प्रशिक्षित लोग "
        "आपकी बात बिना किसी आलोचना के सुनेंगे। हो सके तो किसी भरोसेमंद व्यक्ति - दोस्त, परिवार "
        "के सदस्य या डॉक्टर - को भी बताएँ कि आप क्या महसूस कर रहे हैं।\n\nयह ऐप किसी प्रशिक्षित "
        "व्यक्ति की जगह नहीं ले सकता। जब आप तैयार हों, तब आप यहाँ लौटकर ग्रंथों पर विचार कर सकते हैं।"
    ),
    "hinglish": (
        "Lagta hai aap abhi bahut bhaari bojh utha rahe hain, aur aapne yeh kaha - yeh maayne "
        "rakhta hai. Aapko yeh akele nahi sehna hai. Agar aapke mann mein apni jaan lene ya khud "
        "ko nuksaan pahunchane ke khayal aa rahe hain, toh please abhi kisi se baat karein - neeche "
        "diye numbers par trained log aapki baat bina judge kiye sunenge. Ho sake toh kisi "
        "bharosemand insaan - dost, family ya doctor - ko bhi batayein ki aap kya mehsoos kar "
        "rahe hain.\n\nYeh app kisi trained insaan ki jagah nahi le sakta. Jab aap taiyaar hon, "
        "tab yahan laut kar granthon par vichaar kar sakte hain."
    ),
}

CONCERN_NOTE: dict[str, str] = {
    "abuse_or_unsafe_home": (
        "If someone is hurting you or you feel unsafe where you live, your safety comes first. "
        "No scripture asks you to endure abuse. The Women Helpline (181) and emergency services "
        "(112) can help, including with shelter and legal support."
    ),
    "violence_toward_others": (
        "If you feel close to hurting someone, please step away from the situation and talk to "
        "someone now - Tele-MANAS (14416) is free and available 24×7."
    ),
    "harm_justification": (
        "The Bhagavad Gita does not give anyone permission to harm, punish or take revenge on "
        "another person. Krishna's words about fighting were spoken to a warrior in a specific "
        "war, and are discussed below in that context."
    ),
    "severe_distress": (
        "What you are going through sounds very hard. Talking to someone trained can help - "
        "Tele-MANAS (14416) is free, confidential and available 24×7."
    ),
}


def crisis_message(language: str) -> str:
    return CRISIS_MESSAGE.get(language, CRISIS_MESSAGE["en"])


def concern_note(categories: list[str]) -> str | None:
    notes = [CONCERN_NOTE[c] for c in categories if c in CONCERN_NOTE]
    return " ".join(notes) if notes else None
