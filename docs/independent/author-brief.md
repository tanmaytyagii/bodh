# Writing questions for BODH's evaluation

*For question authors. Please read this page only; you do not need anything else from the project.*

BODH (बोध) helps people explore questions about their lives through the Bhagavad Gita and three Upanishads: the Katha, the Isha and the Kena. To check how well it finds the right passages, we need questions written by people who have never seen how it works. That is you.

## Before you start

- **Don't use BODH**, and don't read its website, documentation or code, until you have sent your questions.
- **Don't look up verses** in order to write questions around them, and don't use an AI chatbot to write or polish your questions. Ask what you, or people you know, would really ask.
- **Your questions will be published** in BODH's open repository, under a pseudonym such as A1, and used to test this and other systems. Leave out anything that could identify you or anyone else: names, places you live, workplaces, contact details, identifying health details. You can withdraw your questions until we tell you the set has been frozen.

## What to write

About **30 questions**, more if you like:

- **at least 10 in Hindi, in Devanagari;**
- **at least 10 in Hinglish:** Hindi typed in Latin letters, mixed with English the way you would type it;
- the rest in English.

Hindi and Hinglish matter most: BODH is weakest there, and we have the fewest real examples.

Roughly these kinds:

- **About half: something happening in a life**, yours or someone's you know. Work, study and exams, money, family, marriage, friendship and love, loss, illness, anger, fear, habits, phones and social media, comparing yourself with others, faith and doubt, what to do with your life.
- **Questions about the texts:** what one of them says about something, who says what to whom, what a word means.
- **A few verses you half remember**, quoted the way you remember them or described in your own words.
- **A few questions that could reasonably mean more than one thing.**
- **About 5 questions these texts cannot answer:** practical, factual, technical or about current events. We need these too: they test whether BODH admits it has nothing to offer.

## How to write

- **Write as you would really type.** Use your own spelling, even if it is not consistent ("nahi", "nhi" or "nai"), your own mix of Hindi and English, slang, short or long, with or without punctuation.
- **One question per row.** It can be a single sentence or a few, the way you would write to someone you trust.
- **Don't polish or correct.** Typos you would really make are welcome.

## How to send them

Fill in [`questions-template.csv`](questions-template.csv) in any spreadsheet program, one row per question:

| Column | What to put |
| --- | --- |
| `question` | The question, exactly as you would type it |
| `language` | `en`, `hi` (Devanagari) or `hinglish` (Hindi in Latin letters) |
| `category` | Optional: `life`, `knowledge`, `lookup` (a verse you remember), `paraphrase` (a verse in your own words), `ambiguous` or `out-of-scope` |
| `note` | Optional: anything you want us to know, such as "ambiguous on purpose" |

Save it as CSV (UTF-8) and send it back. If you write the file by hand, put any question that contains a comma in double quotes.

---

## हिंदी में

BODH (बोध) भगवद्गीता और कठ, ईश और केन उपनिषदों के ज़रिए लोगों को अपने जीवन के प्रश्नों पर सोचने में मदद करता है। यह जाँचने के लिए कि वह सही अंश ढूँढ पाता है या नहीं, हमें ऐसे लोगों के लिखे प्रश्न चाहिए जिन्होंने उसे कभी इस्तेमाल न किया हो।

- **प्रश्न भेजने से पहले BODH इस्तेमाल न करें,** और उसकी वेबसाइट या दस्तावेज़ न पढ़ें। श्लोक खोजकर उनके हिसाब से प्रश्न न बनाएँ, और किसी AI चैटबॉट से प्रश्न न लिखवाएँ।
- **लगभग 30 प्रश्न लिखें:** कम से कम 10 हिंदी (देवनागरी) में, कम से कम 10 हिंग्लिश में (रोमन अक्षरों में हिंदी, अंग्रेज़ी मिलाकर, जैसे आप टाइप करते हैं), बाकी अंग्रेज़ी में।
- **लगभग आधे प्रश्न ज़िंदगी की किसी स्थिति के बारे में हों:** काम, पढ़ाई, परीक्षा, पैसा, परिवार, शादी, दोस्ती, प्यार, किसी को खोना, बीमारी, गुस्सा, डर, आदतें, फ़ोन, दूसरों से तुलना, आस्था और संदेह।
- **बाकी प्रश्न ऐसे हों:**
  - ग्रंथों के बारे में प्रश्न;
  - आधे-अधूरे याद श्लोक;
  - ऐसे प्रश्न जिनके एक से ज़्यादा अर्थ हो सकते हैं;
  - लगभग 5 ऐसे प्रश्न जिनका उत्तर इन ग्रंथों में नहीं है, जैसे व्यावहारिक, तथ्यात्मक या तकनीकी प्रश्न।
- **वैसे ही लिखें जैसे आप सच में टाइप करते हैं।** अपनी वर्तनी में लिखें, अपनी भाषा-मिलावट के साथ, बिना सुधारे।
- **आपके प्रश्न एक छद्म नाम (जैसे A1) से सार्वजनिक रूप से प्रकाशित होंगे।** इसलिए नाम, जगह, संपर्क या पहचान बताने वाली कोई बात न लिखें।
- **प्रश्न [`questions-template.csv`](questions-template.csv) में भरें:**
  - `question` में प्रश्न;
  - `language` में `en`, `hi` या `hinglish`;
  - `category` और `note` चाहें तो खाली छोड़ दें।
