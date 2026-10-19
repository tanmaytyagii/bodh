"use client";

import { BRAND } from "./brand";
import type { Answer, HistoryTurn, Passage } from "./types";

// Saved reflections live only in this browser (localStorage): no account, and
// nothing is sent to the server. A reflection is an answer you saved, or a
// passage, each with room for your notes. The current conversation is kept
// in sessionStorage so a refresh does not lose it, and it disappears with the tab.

/** An answer you saved. Items saved before passages could be saved have no `kind`. */
export interface SavedReflection {
  kind?: "answer";
  id: string;
  savedAt: string;
  question: string;
  answer: Answer;
  note: string;
}

/** A passage you saved, exactly as the collection holds it. */
export interface SavedPassage {
  kind: "passage";
  /** "passage:" and the passage's id, so it never collides with an answer's id. */
  id: string;
  savedAt: string;
  passage: Passage;
  note: string;
}

/**
 * A reflection brought in from a Markdown export made before exports carried
 * their data: the question, your notes, and the rest of the file kept as
 * plain text. It is shown as text, never as passages or as a model's reply,
 * because none of it can be checked against the collection.
 */
export interface SavedText {
  kind: "text";
  id: string;
  savedAt: string;
  question: string;
  body: string;
  note: string;
}

export type SavedItem = SavedReflection | SavedPassage | SavedText;

export function isSavedPassage(item: SavedItem): item is SavedPassage {
  return item.kind === "passage";
}

export function isSavedText(item: SavedItem): item is SavedText {
  return item.kind === "text";
}

export function isSavedAnswer(item: SavedItem): item is SavedReflection {
  return item.kind === undefined || item.kind === "answer";
}

export const passageItemId = (passageId: string) => `passage:${passageId}`;

export interface Turn {
  question: string;
  answer: Answer;
}

const REFLECTIONS_KEY = "sw.reflections.v1";
const CONVERSATION_KEY = "sw.conversation.v1";

const listeners = new Set<() => void>();
let cache: SavedItem[] | null = null;
const EMPTY: SavedItem[] = [];

function read(): SavedItem[] {
  try {
    const raw = window.localStorage.getItem(REFLECTIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Stores the list, and only then shows it. When this browser will not store it
 * (its storage for this site is full, or turned off), nothing changes and the
 * caller says so: nothing is ever shown as saved that a reload would lose.
 */
function write(items: SavedItem[]): boolean {
  try {
    window.localStorage.setItem(REFLECTIONS_KEY, JSON.stringify(items));
  } catch {
    return false;
  }
  cache = items;
  listeners.forEach((listener) => listener());
  return true;
}

export const reflectionsStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === REFLECTIONS_KEY) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): SavedItem[] {
    if (cache === null) cache = read();
    return cache;
  },
  getServerSnapshot(): SavedItem[] {
    return EMPTY;
  },
  /** Saves an answer; false if this browser would not store it. */
  save(question: string, answer: Answer): boolean {
    const items = this.getSnapshot().filter((item) => item.id !== answer.id);
    return write([{ kind: "answer", id: answer.id, savedAt: new Date().toISOString(), question, answer, note: "" }, ...items]);
  },
  /** Saves a passage once (saving it again keeps the first save and its notes); false if this browser would not store it. */
  savePassage(passage: Passage): boolean {
    const id = passageItemId(passage.id);
    if (this.has(id)) return true;
    return write([{ kind: "passage", id, savedAt: new Date().toISOString(), passage, note: "" }, ...this.getSnapshot()]);
  },
  /**
   * Adds items (from an import) that are not already here: how many were
   * added, or null if this browser would not store them, and then none are.
   */
  addMany(items: SavedItem[]): number | null {
    const current = this.getSnapshot();
    const known = new Set(current.map((item) => item.id));
    const added = items.filter((item) => !known.has(item.id) && (known.add(item.id), true));
    if (added.length) {
      const merged = [...added, ...current].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      if (!write(merged)) return null;
    }
    return added.length;
  },
  /** False if this browser would not store the note. */
  updateNote(id: string, note: string): boolean {
    return write(this.getSnapshot().map((item) => (item.id === id ? { ...item, note } : item)));
  },
  remove(id: string): boolean {
    return write(this.getSnapshot().filter((item) => item.id !== id));
  },
  clear(): boolean {
    return write([]);
  },
  has(id: string): boolean {
    return this.getSnapshot().some((item) => item.id === id);
  },
};

export function loadConversation(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(CONVERSATION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Turn[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeConversation(turns: Turn[]): void {
  try {
    if (turns.length) window.sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(turns));
    else window.sessionStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // ignore
  }
}

/** Compact history sent with follow-up questions. */
export function historyFor(turns: Turn[]): HistoryTurn[] {
  return turns.flatMap((turn) => [
    { role: "user" as const, content: turn.question },
    {
      role: "assistant" as const,
      content: summarizeAnswer(turn.answer),
      passage_ids: [
        ...turn.answer.teachings.map((t) => t.passage.id),
        ...turn.answer.related.map((r) => r.passage.id),
      ].slice(0, 8),
    },
  ]);
}

function summarizeAnswer(answer: Answer): string {
  const parts: string[] = [];
  if (answer.summary) parts.push(`In short: ${answer.summary}`);
  if (answer.situation) parts.push(`Situation: ${answer.situation}`);
  for (const t of answer.teachings) {
    parts.push(`Cited ${t.passage.ref}: ${t.why_it_applies} Application: ${t.application}`);
  }
  if (answer.steps.length) parts.push(`Steps: ${answer.steps.map((s) => s.title).join("; ")}`);
  if (answer.reflective_question) parts.push(`Reflective question: ${answer.reflective_question}`);
  if (answer.message) parts.push(answer.message);
  if (answer.kind === "retrieval_only") {
    parts.push(`Passages shown: ${answer.passages.map((p) => p.ref).join(", ")}`);
  }
  return parts.join("\n").slice(0, 6000);
}

const DISCLAIMER = `Saved from ${BRAND.name}. AI-assisted reflection grounded in the passages cited above. Not religious or professional advice.`;

/** One saved item as Markdown, for reading anywhere. */
export function itemToMarkdown(item: SavedItem): string {
  const date = new Date(item.savedAt).toLocaleDateString();
  if (isSavedPassage(item)) {
    const p = item.passage;
    const lines = [`# Passage - ${date}`, "", `## ${p.ref}`, ""];
    if (p.sanskrit) lines.push(p.sanskrit, "");
    if (p.transliteration) lines.push(p.transliteration, "");
    lines.push(`> ${p.translation}`, `> - ${p.translator} (${p.citation.url})`, "");
    if (item.note) lines.push("## My notes", "", item.note, "");
    lines.push("---", `Saved from ${BRAND.name}. Source text as printed in the cited edition.`);
    return lines.join("\n");
  }
  if (isSavedText(item)) {
    const lines = [`# Reflection - ${date}`, "", `> ${item.question}`, "", item.body, ""];
    if (item.note) lines.push("## My notes", "", item.note, "");
    lines.push("---", `Imported into ${BRAND.name} from an earlier Markdown export.`);
    return lines.join("\n");
  }
  const a = item.answer;
  const lines = [`# Reflection - ${date}`, "", `> ${item.question}`, ""];
  if (a.summary) lines.push("## In short", "", stripMarkers(a.summary), "");
  if (a.situation) lines.push("## Your situation", "", stripMarkers(a.situation), "");
  for (const t of a.teachings) {
    lines.push(`## ${t.passage.ref}`, "");
    if (t.passage.sanskrit) lines.push(t.passage.sanskrit, "");
    lines.push(`> ${t.passage.translation}`, `> - ${t.passage.translator} (${t.passage.citation.url})`, "");
    lines.push(`**What it says:** ${stripMarkers(t.what_it_says)}`, "");
    lines.push(`**Applying it:** ${stripMarkers(t.application)}`, "");
  }
  if (a.steps.length) {
    lines.push("## Path forward", "");
    a.steps.forEach((s) => lines.push(`- **${s.title}** - ${stripMarkers(s.detail)}`));
    lines.push("");
  }
  if (a.reflective_question) lines.push("## To reflect on", "", stripMarkers(a.reflective_question), "");
  if (item.note) lines.push("## My notes", "", item.note, "");
  lines.push("---", DISCLAIMER);
  return lines.join("\n");
}

/** Marks the data an export carries, so it can be imported again exactly. */
export const EXPORT_FORMAT = "bodh-reflections";
export const EXPORT_VERSION = 1;
export const DATA_OPEN = "<!-- bodh-reflections-data";
export const DATA_CLOSE = "-->";

/**
 * The export file: every item as Markdown to read, then the same items as
 * data, inside an HTML comment (hidden wherever the Markdown is shown), so
 * the file can be imported again without losing anything. "--" never appears
 * in the data, so the comment cannot end early.
 */
export function exportDocument(items: SavedItem[]): string {
  const data = JSON.stringify({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    items,
  }).replace(/--/g, "-\\u002d");
  return `${items.map(itemToMarkdown).join("\n\n")}\n\n${DATA_OPEN}\n${data}\n${DATA_CLOSE}\n`;
}

export function stripMarkers(text: string): string {
  return text.replace(/\[\[\s*bg\.(\d+)\.(\d+)\s*\]\]/gi, "(BG $1.$2)").replace(/\[\[[^\]]*\]\]/g, "");
}
