// "Ask about this": a link from a passage, theme or story to the Ask page that
// fills the question box (nothing is sent until you send it) and remembers
// which passages the question is about, so the reply can read them.
//
// The link's address carries the prefill (/?ask=…&about=…&passages=…), so it
// also works in a new tab. On the Ask page itself the page cannot see a
// navigation to its own address, so the link announces the prefill with an
// event instead; either way the page then clears the address, leaving no
// navigation state behind.

export const ASK_PREFILL_EVENT = "sw:ask-prefill";

export interface AskPrefill {
  question: string;
  /** What the question is about, as shown beside the question box: "BG 2.47", a theme, a story. */
  about: string | null;
  passageIds: string[];
}

const MAX_QUESTION = 4000;
const MAX_ABOUT = 160;
const MAX_PASSAGES = 4;
const PASSAGE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function askHref(prefill: AskPrefill): string {
  const params = new URLSearchParams({ ask: prefill.question });
  if (prefill.about) params.set("about", prefill.about);
  const ids = prefill.passageIds.slice(0, MAX_PASSAGES);
  if (ids.length) params.set("passages", ids.join(","));
  return `/?${params.toString()}`;
}

/** The prefill in an address's query string, if it has a valid one. */
export function readPrefill(search: string): AskPrefill | null {
  const params = new URLSearchParams(search);
  // Only the start is trimmed: the question ends ready for the person to finish it.
  const question = params.get("ask")?.trimStart();
  if (!question?.trim()) return null;
  const about = params.get("about")?.trim() || null;
  const passageIds = (params.get("passages") ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => PASSAGE_ID.test(id))
    .slice(0, MAX_PASSAGES);
  return {
    question: question.slice(0, MAX_QUESTION),
    about: about ? about.slice(0, MAX_ABOUT) : null,
    passageIds,
  };
}

/** Used by the links as they navigate: on the Ask page itself, hand the prefill over directly. */
export function announceAskPrefill(event: { preventDefault(): void }, prefill: AskPrefill): void {
  if (window.location.pathname !== "/") return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent<AskPrefill>(ASK_PREFILL_EVENT, { detail: prefill }));
}
