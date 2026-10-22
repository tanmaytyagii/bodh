# Labelling evaluation questions

*For labellers. Please read this page only.*

You will receive two files:

- **a labelling sheet:** questions, one per row, with empty columns for your answers;
- **`texts.csv`:** every passage of the Bhagavad Gita (Annie Besant's 1922 translation) and of the Katha, Isha and Kena Upanishads (Swami Paramananda's translation), with its id, reference, speaker and English text.

For each question, decide which passages **clearly address it**. Nobody has run BODH on these questions yet, and nobody will until every question is labelled: your labels are the answer key it will be measured against.

## Work from the texts alone

- **Use `texts.csv`, or a printed edition of the same translations.** Read the chapters that bear on the question, and search the file with your spreadsheet's or editor's ordinary Find. Search for the translation's own words as well as yours: it is English of 1922 ("thou", "fruit of action", "the pairs of opposites").
- **Don't use BODH**: not its Ask page, its search, its verse pages or its themes. They would show you what the system already finds, or how its editors grouped the passages, and your labels would then reward that instead of measuring it.
- **Don't use AI tools or commentaries** to find passages for you.
- **Work alone.** Don't discuss the questions with the other labeller until you have both sent your sheets. Disagreements are useful: they show which questions are genuinely open.

## Filling in the sheet

| Column | What to put |
| --- | --- |
| `expected` | Ids of the passages that clearly address the question, separated by spaces or commas: `bg.2.47 bg.2.48` |
| `out_of_scope` | `yes` if the texts do not address the question at all; otherwise `no` |
| `note` | Optional, but welcome for any borderline call: why you chose these passages, or why none |

Leave the other columns as they are. If you cannot decide on a question, leave its row blank: it simply stays unlabelled by you.

**Passage ids** are in the first column of `texts.csv`:

| Text | Id | Example |
| --- | --- | --- |
| Bhagavad Gita | `bg.<chapter>.<verse>` | 2.47 is `bg.2.47` |
| Katha Upanishad | `katha.<part>.<verse>` | Paramananda's six parts: 1.2.1 is `katha.2.1`, 2.1.1 is `katha.4.1` |
| Isha Upanishad | `isha.1.<verse>` | verse 1 is `isha.1.1` |
| Kena Upanishad | `kena.<part>.<verse>` | 3.6 is `kena.3.6` |

## What counts as "clearly addresses"

- **A life situation:** a passage a thoughtful reader would point to, because it speaks to the situation itself, not just to one word in it. A verse about victory does not address "who won the match"; a verse about acting without attachment to results does address exam anxiety.
- **A question about the texts, or a half-remembered verse:** the verse or verses it is about.
- **A question that could mean more than one thing:** passages for each reasonable reading, with a note.
- **Most questions:** one to eight passages. Fewer, clearly relevant ones beat many loose ones; the list does not need to be complete.
- **When nothing in the texts speaks to it:** `out_of_scope` is `yes` and `expected` is empty. That includes practical, factual and technical questions, even when they share words with the texts.

Expect two to four minutes per question. Send the completed sheet back as CSV (UTF-8), with the pseudonym you were given (L1, L2, …).
