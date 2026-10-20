"""Romanized Hindi (Hinglish) in Devanagari, for search.

The embedding model understands Hindi written in Devanagari far better than
the same words typed in Latin letters ("mujhe bahut gussa aata hai"), so the
idea is to also search a Hinglish question as it would be written in
Devanagari ("मुझे बहुत गुस्सा आता है"). The original question is always kept:
this only adds a rendering.

Deterministic and conservative:

* a question is treated as Hinglish only when at least two unambiguous
  Hindi function words appear in it ("hai", "mujhe", "nahi", ...); English,
  questions already in Devanagari and romanized Sanskrit verse lookups are
  left alone;
* words are rewritten from a lexicon of common Hindi words with their usual
  Devanagari spelling. Anything else, including the English words people mix
  in ("breakup", "interview"), stays as typed. `rule_based=True` also
  transliterates unknown words that are not English vocabulary; it is noisier
  and is measured separately.

Experimental: production retrieval does not use this module. Measured on the
labelled questions, every way of searching with the rendering lowered
Hinglish recall (docs/EVALUATION.md, "Experiments not adopted"); it is kept
with its tests so the experiment can be rerun
(`python -m app.evaluation.experiments hinglish`).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

# Common Hindi words as people type them, with their usual Devanagari spelling.
_LEXICON_SOURCE = """
main mai:मैं  mujhe mujhko:मुझे  mera:मेरा  meri:मेरी  mere:मेरे  hum:हम  hame hamein humein:हमें
hamara:हमारा  hamari:हमारी  tum:तुम  tumhe tumhein:तुम्हें  tumhara:तुम्हारा  aap:आप  aapka:आपका
aapki:आपकी  wo woh vo voh:वो  ye yeh:ये  uska:उसका  uski:उसकी  uske:उसके  usko:उसको  unka:उनका
unki:उनकी  unke:उनके  unko:उनको  apna:अपना  apni:अपनी  apne:अपने  koi:कोई  kuch kuchh:कुछ  sab:सब
sabko:सबको  sabse:सबसे  kisi:किसी  kaun:कौन  kya:क्या  kyun kyon kyu:क्यों  kaise kese:कैसे  kab:कब
kahan:कहाँ  jab:जब  tab:तब  ab:अब  phir fir:फिर  aur or:और  lekin:लेकिन  par pr:पर  magar:मगर
kyunki kyuki kyonki:क्योंकि  isliye:इसलिए  toh:तो  bhi:भी  na:न  nahi nahin nhi:नहीं  mat:मत  haan:हाँ
ka:का  ki:की  ke:के  ko:को  se:से  mein mai:में  pe:पे  tak:तक  wala:वाला  wali:वाली  wale:वाले
liye:लिए  liya:लिया  saath sath:साथ  baad:बाद  pehle pahle:पहले  abhi:अभी  kabhi:कभी  hamesha:हमेशा
roz roj:रोज़  din:दिन  raat:रात  subah:सुबह  shaam sham:शाम  saal:साल  mahine:महीने  baar bar:बार
bahut bohot bahot bohat:बहुत  zyada jyada zyaada:ज़्यादा  kam:कम  thoda:थोड़ा  sirf:सिर्फ़
bilkul:बिल्कुल  sach:सच  galat:ग़लत  sahi:सही  accha acha achha:अच्छा  bura:बुरा  theek thik:ठीक
hai:है  hain:हैं  hoon hun hu hoo:हूँ  ho:हो  hota:होता  hoti:होती  hote:होते  hua:हुआ  hui:हुई
hue:हुए  tha:था  thi:थी  raha rha:रहा  rahi rhi:रही  rahe rhe:रहे  rehta rahta:रहता  rehti rahti:रहती
kar:कर  karna:करना  karta:करता  karti:करती  karte:करते  karun karu karoon:करूँ  karo:करो  kiya:किया
karke:करके  jaana jana:जाना  jaata jata:जाता  jaati jati:जाती  gaya:गया  gayi gai:गई  gaye:गए
jaane:जाने  aa:आ  aana:आना  aata ata:आता  aati ati:आती  aaya aya:आया  aayi:आई  lagta:लगता
lagti:लगती  lagte:लगते  laga:लगा  lagi:लगी  lag:लग  mil:मिल  milta:मिलता  milti:मिलती  mila:मिला
mili:मिली  de:दे  deta:देता  deti:देती  diya:दिया  le:ले  leta:लेता  leti:लेती  pa:पा  paata:पाता
paati:पाती  pata:पता  sakta:सकता  sakti:सकती  sakte:सकते  chahta:चाहता  chahti:चाहती  chahte:चाहते
chahiye:चाहिए  samajh samjh:समझ  samajhta:समझता  samjha:समझा  soch:सोच  sochta:सोचता  sochti:सोचती
dekh:देख  dekhta:देखता  bolta:बोलता  bolti:बोलती  bola:बोला  kehte kahte:कहते  padh:पढ़
padhna:पढ़ना  padhai padhayi:पढ़ाई  kho:खो  chhod chod:छोड़  chhodna chodna:छोड़ना  toota tuta:टूटा
darta:डरता  darti:डरती  rota:रोता  rona:रोना  jeena jina:जीना  marna:मरना  chalata:चलाता
banu banoo:बनूँ  banna:बनना  bana:बना  gussa gussaa:गुस्सा  gusse:गुस्से  krodh:क्रोध  jalan:जलन
irshya:ईर्ष्या  dar darr:डर  bhay:भय  chinta:चिंता  pareshan pareshaan:परेशान  dukh:दुख  dukhi:दुखी
udaas udas:उदास  khaali khali:ख़ाली  akela:अकेला  akeli:अकेली  akelapan:अकेलापन  maut:मौत
mrityu:मृत्यु  yaad:याद  naukri naukari:नौकरी  kaam:काम  tayari taiyari tayyari:तैयारी
pariksha:परीक्षा  parinaam parinam:परिणाम  neend:नींद  dost:दोस्त  doston dosto:दोस्तों  dosti:दोस्ती
yaar:यार  dhokha dhoka:धोखा  maafi mafi:माफ़ी  maaf:माफ़  ghamand:घमंड  ahankar ahankaar:अहंकार
lalach:लालच  lobh:लोभ  aalas:आलस  aalsi alsi:आलसी  mann:मन  dimag dimaag:दिमाग़  dil:दिल
dhyan dhyaan:ध्यान  faisla:फ़ैसला  nirnay:निर्णय  pyaar pyar:प्यार  prem:प्रेम  shaadi shadi:शादी
rishta:रिश्ता  rishte:रिश्ते  ghar:घर  gharwale:घरवाले  parivaar parivar:परिवार  maa:माँ  papa:पापा
pita:पिता  mata:माता  bhai:भाई  behen behan:बहन  dadi:दादी  dada:दादा  nani:नानी  nana:नाना
beta:बेटा  beti:बेटी  pati:पति  patni:पत्नी  bachche bacche:बच्चे  log:लोग  himmat:हिम्मत
bharosa:भरोसा  vishwas:विश्वास  shraddha:श्रद्धा  paisa:पैसा  paise:पैसे  dhan:धन  jhooth jhoot:झूठ
pachtava pachtawa:पछतावा  safalta:सफलता  asafal:असफल  mehnat:मेहनत  kismat:क़िस्मत
bhagwan bhagvan:भगवान  ishwar:ईश्वर  puja pooja:पूजा  prarthana:प्रार्थना  zindagi jindagi:ज़िंदगी
jeevan jivan:जीवन  matlab:मतलब  maksad:मक़सद  sukoon sukun:सुकून  shanti:शांति  khushi:ख़ुशी
khush:ख़ुश  sharam sharm:शर्म  izzat:इज़्ज़त  samaj samaaj:समाज  duniya:दुनिया  insaan:इंसान
galti:ग़लती  sapna:सपना  sapne:सपने  umeed:उम्मीद  nirash niraash:निराश  thaka:थका  thakaan:थकान
bimari beemari:बीमारी  kamzor:कमज़ोर  majboor:मजबूर  zimmedari jimmedari:ज़िम्मेदारी
kartavya:कर्तव्य  jaane:जाने  aage:आगे  peeche piche:पीछे  andar:अंदर  bahar:बाहर  sabak:सबक़
"""


def _parse(source: str) -> dict[str, str]:
    lexicon: dict[str, str] = {}
    for entry in source.split("  "):
        entry = entry.strip()
        if not entry:
            continue
        words, devanagari = entry.rsplit(":", 1)
        for word in words.split():
            lexicon.setdefault(word, unicodedata.normalize("NFC", devanagari))
    return lexicon


LEXICON: dict[str, str] = _parse(_LEXICON_SOURCE.replace("\n", "  "))

# Hindi words that are not also common English words: two of them make a question Hinglish.
_MARKER_WORDS = """
hai hain hoon hun mujhe mujhko mera meri mere hamara tumhara aapka uska uski unka unki apna apni apne
kya kyun kyon kaise nahi nahin nhi aur bahut bohot zyada jyada raha rahi rahe rha rhi karta karti
karte karun karna kiya hota hoti hote hua hui gaya gayi lagta lagti aata aati chahiye chahta chahte
sakta sakti samajh baad pehle kabhi abhi hamesha mein ke ki ka ko se bhi toh lekin kyunki
"""
MARKERS = frozenset(_MARKER_WORDS.split())

_TOKEN = re.compile(r"[A-Za-z]+|[^A-Za-z]+")
_DEVANAGARI = re.compile("[ऀ-ॿ]")


def is_hinglish(text: str, *, threshold: int = 2) -> bool:
    """Whether a question is romanized Hindi (possibly mixed with English)."""
    if _DEVANAGARI.search(text):
        return False
    words = [w.lower() for w in re.findall(r"[A-Za-z]+", text)]
    return sum(1 for w in words if w in MARKERS) >= threshold


def _hindi_spelling(word: str) -> str:
    """A casual romanization in ITRANS terms: a final 'a' or 'i' is long in
    Hindi (gussa → gussā, dadi → dādī), and doubled vowels mean long ones."""
    word = word.replace("ee", "ii").replace("oo", "uu")
    if len(word) > 2 and word.endswith("a") and not word.endswith("aa"):
        word += "a"
    elif len(word) > 2 and word.endswith("i") and not word.endswith("ii"):
        word += "i"
    return word


def rule_based(word: str) -> str:
    """Transliterate one romanized Hindi word with the ITRANS scheme, as Hindi
    is written: without the Sanskrit virama on a final consonant."""
    devanagari = transliterate(_hindi_spelling(word.lower()), sanscript.ITRANS, sanscript.DEVANAGARI)
    return unicodedata.normalize("NFC", devanagari.removesuffix("्"))


def to_devanagari(text: str, *, english: Iterable[str] = (), rule_based_fallback: bool = False) -> str | None:
    """The Devanagari rendering of a Hinglish question, or None when the text is
    not Hinglish or nothing in it could be rewritten. `english` lists words to
    keep as typed when `rule_based_fallback` transliterates unknown words."""
    if not is_hinglish(text):
        return None
    keep = {w.lower() for w in english}
    out: list[str] = []
    changed = 0
    for token in _TOKEN.findall(unicodedata.normalize("NFC", text)):
        word = token.lower()
        if not token.isalpha() or not token.isascii():
            out.append(token)
        elif word in LEXICON:
            out.append(LEXICON[word])
            changed += 1
        elif rule_based_fallback and len(word) > 2 and word not in keep:
            out.append(rule_based(word))
            changed += 1
        else:
            out.append(token)
    return "".join(out) if changed else None
