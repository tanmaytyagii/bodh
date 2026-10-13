"use client";

import { BRAND } from "./brand";
import type { Answer, HistoryTurn } from "./types";

// Saved reflections live only in this browser (localStorage): no account, and
// nothing is sent to the server. The current conversation is kept in
// sessionStorage so a refresh does not lose it, and it disappears with the tab.

export interface SavedReflection {
  id: string;
  savedAt: string;
  question: string;
  answer: Answer;
  note: string;
}

export interface Turn {
  question: string;
  answer: Answer;
}

const REFLECTIONS_KEY = "sw.reflections.v1";
const CONVERSATION_KEY = "sw.conversation.v1";

const listeners = new Set<() => void>();
let cache: SavedReflection[] | null = null;
const EMPTY: SavedReflection[] = [];

function read(): SavedReflection[] {
  try {
    const raw = window.localStorage.getItem(REFLECTIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedReflection[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: SavedReflection[]): void {
  cache = items;
  try {
    window.localStorage.setItem(REFLECTIONS_KEY, JSON.stringify(items));
  } catch {
    // Storage full or disabled (e.g. private mode): keep the in-memory copy.
  }
  listeners.forEach((listener) => listener());
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
  getSnapshot(): SavedReflection[] {
    if (cache === null) cache = read();
    return cache;
  },
  getServerSnapshot(): SavedReflection[] {
    return EMPTY;
  },
  save(question: string, answer: Answer): void {
    const items = this.getSnapshot().filter((item) => item.id !== answer.id);
    write([{ id: answer.id, savedAt: new Date().toISOString(), question, answer, note: "" }, ...items]);
  },
  updateNote(id: string, note: string): void {
    write(this.getSnapshot().map((item) => (item.id === id ? { ...item, note } : item)));
  },
  remove(id: string): void {
    write(this.getSnapshot().filter((item) => item.id !== id));
  },
  clear(): void {
    write([]);
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

export function reflectionToMarkdown(item: SavedReflection): string {
  const a = item.answer;
  const lines = [`# Reflection - ${new Date(item.savedAt).toLocaleDateString()}`, "", `> ${item.question}`, ""];
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
  lines.push(
    "---",
    `Saved from ${BRAND.name}. AI-assisted reflection grounded in the passages cited above. Not religious or professional advice.`,
  );
  return lines.join("\n");
}

export function stripMarkers(text: string): string {
  return text.replace(/\[\[\s*bg\.(\d+)\.(\d+)\s*\]\]/gi, "(BG $1.$2)").replace(/\[\[[^\]]*\]\]/g, "");
}
