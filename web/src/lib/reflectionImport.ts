// Reading an exported reflections file back in.
//
// Three kinds of file are understood:
//  * an export made by this version: Markdown with the items as data in a
//    closing HTML comment (exportDocument), restored exactly;
//  * the same data as plain JSON;
//  * a Markdown export from before exports carried data: each reflection is
//    kept as plain text with its question and your notes (SavedText). Its
//    passages cannot be checked against the collection, so they are never
//    shown as source text.
//
// Nothing in a file is trusted: every field is checked before anything is
// kept, text is only ever rendered as text, and links are accepted only as
// same-site paths to the scripture pages or as http(s) addresses.

import {
  DATA_CLOSE,
  DATA_OPEN,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  passageItemId,
  type SavedItem,
  type SavedPassage,
  type SavedReflection,
  type SavedText,
} from "./reflections";
import type { Answer, Passage } from "./types";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 1000;
const MAX_NOTE = 20_000;
const MAX_QUESTION = 4000;
const MAX_TEXT = 200_000;

export type ImportProblem = "empty" | "notAnExport" | "newerVersion" | "unreadable";

export class ImportError extends Error {
  constructor(readonly problem: ImportProblem) {
    super(problem);
  }
}

export interface ImportResult {
  items: SavedItem[];
  /** Entries in the file that were not valid, and were left out. */
  invalid: number;
  /** "data": restored exactly; "markdown": an older export, kept as text. */
  source: "data" | "markdown";
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === "string" && value.length <= max;
const isOptionalText = (value: unknown, max = MAX_TEXT): boolean => value === null || value === undefined || isText(value, max);
const isTextList = (value: unknown, max = 200): boolean =>
  Array.isArray(value) && value.length <= max && value.every((item) => isText(item, 20_000));
const isDate = (value: unknown): value is string => isText(value, 64) && !Number.isNaN(Date.parse(value));
const isIdent = (value: unknown, pattern = /^[a-z0-9][a-z0-9._:-]{0,199}$/i): value is string =>
  typeof value === "string" && pattern.test(value);

/** A path on this site to a scripture page: never another site, never a script. */
function isScripturePath(value: unknown): boolean {
  return typeof value === "string" && value.length <= 300 && /^\/scripture\/[a-z0-9-]+\/[\w./-]*$/i.test(value);
}

function isWebAddress(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const PROVENANCE = new Set(["verified", "reviewed", "needs_review", "unverified"]);

function isPassage(value: unknown): value is Passage {
  if (!isObject(value)) return false;
  const p = value;
  const citation = p.citation;
  const provenance = p.provenance;
  return (
    isIdent(p.id, /^[a-z0-9][a-z0-9._-]{0,63}$/) &&
    isText(p.ref, 300) &&
    isText(p.short_ref, 100) &&
    isScripturePath(p.path) &&
    isText(p.source_id, 100) &&
    isText(p.source_title, 300) &&
    isText(p.translation) &&
    isText(p.translator, 300) &&
    isOptionalText(p.sanskrit) &&
    isOptionalText(p.transliteration) &&
    isOptionalText(p.transliteration_note, 300) &&
    isOptionalText(p.chapter_title, 300) &&
    isOptionalText(p.chapter_title_original, 300) &&
    isOptionalText(p.speaker, 200) &&
    isTextList(p.speakers, 10) &&
    isTextList(p.context_notes, 20) &&
    (p.chapter === null || typeof p.chapter === "number" || isText(p.chapter, 20)) &&
    (p.verse === null || typeof p.verse === "number" || isText(p.verse, 20)) &&
    isObject(citation) &&
    isText(citation.label, 1000) &&
    isWebAddress(citation.url) &&
    (citation.scan_url === null || citation.scan_url === undefined || isWebAddress(citation.scan_url)) &&
    isOptionalText(citation.page, 40) &&
    isObject(provenance) &&
    PROVENANCE.has(provenance.status as string) &&
    isText(provenance.label, 500) &&
    isTextList(provenance.notes, 20) &&
    Array.isArray(provenance.cross_checks) &&
    provenance.cross_checks.every(
      (c) => isObject(c) && isText(c.edition, 300) && isText(c.status, 100) && isOptionalText(c.other_text) && isOptionalText(c.detail),
    ) &&
    Array.isArray(p.translator_notes) &&
    p.translator_notes.every((n) => isObject(n) && isOptionalText(n.anchor, 300) && isText(n.text)) &&
    Array.isArray(p.corrections) &&
    p.corrections.every((c) => isObject(c) && isText(c.field, 100) && isText(c.printed) && isText(c.corrected) && typeof c.applied === "boolean" && isText(c.basis)) &&
    Array.isArray(p.concepts) &&
    p.concepts.every((c) => isObject(c) && isIdent(c.id, /^[a-z0-9-]{1,100}$/) && isText(c.name, 300))
  );
}

const ANSWER_KINDS = new Set(["guidance", "follow_up", "clarification", "insufficient_sources", "out_of_scope", "crisis", "retrieval_only"]);

function isAnswer(value: unknown): value is Answer {
  if (!isObject(value)) return false;
  const a = value;
  const list = (field: unknown, check: (item: unknown) => boolean, max = 50) =>
    Array.isArray(field) && field.length <= max && field.every(check);
  const safety = a.safety;
  const verification = a.verification;
  const retrieval = a.retrieval;
  return (
    isIdent(a.id) &&
    ANSWER_KINDS.has(a.kind as string) &&
    isText(a.language, 20) &&
    isOptionalText(a.summary) &&
    isOptionalText(a.situation) &&
    list(a.teachings, (t) =>
      isObject(t) &&
      isPassage(t.passage) &&
      isText(t.what_it_says) &&
      isText(t.context) &&
      isOptionalText(t.interpretation_notes) &&
      isText(t.why_it_applies) &&
      isText(t.application) &&
      isText(t.limits),
    ) &&
    isOptionalText(a.path_forward_intro) &&
    list(a.steps, (s) => isObject(s) && isText(s.title, 1000) && isText(s.detail) && isText(s.timeframe, 40)) &&
    isOptionalText(a.framework) &&
    isOptionalText(a.reflective_question) &&
    isOptionalText(a.message) &&
    list(a.related, (r) => isObject(r) && isPassage(r.passage) && isText(r.reason)) &&
    list(a.passages, isPassage) &&
    (a.evidence === null || a.evidence === undefined || ["strong", "moderate", "limited"].includes(a.evidence as string)) &&
    isOptionalText(a.evidence_note) &&
    isOptionalText(a.alternative_readings) &&
    isTextList(a.suggested_follow_ups, 10) &&
    (safety === null ||
      safety === undefined ||
      (isObject(safety) &&
        (safety.level === "concern" || safety.level === "crisis") &&
        isOptionalText(safety.message) &&
        list(safety.resources, (r) =>
          isObject(r) && isText(r.name, 300) && isText(r.contact, 300) && isText(r.detail, 1000) && (r.url === null || r.url === undefined || isWebAddress(r.url)),
        ))) &&
    (verification === null ||
      verification === undefined ||
      (isObject(verification) &&
        typeof verification.checked === "boolean" &&
        isTextList(verification.issues, 100) &&
        isTextList(verification.cited_ids, 100))) &&
    list(a.references ?? [], (r) =>
      isObject(r) && isIdent(r.id, /^[a-z0-9][a-z0-9._-]{0,63}$/) && isText(r.ref, 300) && isText(r.short_ref, 100) && isScripturePath(r.path),
    ) &&
    (a.generated_by === null ||
      a.generated_by === undefined ||
      (isObject(a.generated_by) && isText(a.generated_by.provider, 100) && isText(a.generated_by.model, 200))) &&
    (retrieval === null ||
      retrieval === undefined ||
      (isObject(retrieval) &&
        isTextList(retrieval.queries, 20) &&
        list(retrieval.concepts, (c) => isObject(c) && isIdent(c.id, /^[a-z0-9-]{1,100}$/) && isText(c.name, 300) && isText(c.via, 40)) &&
        isText(retrieval.evidence, 40) &&
        isTextList(retrieval.passage_ids, 50) &&
        (retrieval.matches === undefined ||
          list(retrieval.matches, (m) =>
            isObject(m) &&
            isText(m.passage_id, 64) &&
            list(m.themes, (c) => isObject(c) && isIdent(c.id, /^[a-z0-9-]{1,100}$/) && isText(c.name, 300), 10) &&
            isTextList(m.words, 10),
          )))) &&
    isOptionalText(a.notice, 2000)
  );
}

/** A checked copy of one item from an export's data, or null. */
function readItem(value: unknown): SavedItem | null {
  if (!isObject(value) || !isDate(value.savedAt) || !isText(value.note ?? "", MAX_NOTE)) return null;
  const savedAt = new Date(value.savedAt).toISOString();
  const note = (value.note as string | undefined) ?? "";
  if (value.kind === "passage") {
    if (!isPassage(value.passage) || value.id !== passageItemId(value.passage.id)) return null;
    const item: SavedPassage = { kind: "passage", id: value.id, savedAt, passage: value.passage, note };
    return item;
  }
  if (value.kind === "text") {
    if (!isIdent(value.id) || !isText(value.question, MAX_QUESTION) || !isText(value.body)) return null;
    const item: SavedText = { kind: "text", id: value.id, savedAt, question: value.question, body: value.body, note };
    return item;
  }
  if (value.kind !== undefined && value.kind !== "answer") return null;
  if (!isText(value.question, MAX_QUESTION) || !isAnswer(value.answer) || value.id !== value.answer.id) return null;
  const item: SavedReflection = { kind: "answer", id: value.id, savedAt, question: value.question, answer: value.answer, note };
  return item;
}

function readData(data: unknown): ImportResult {
  if (!isObject(data) || data.format !== EXPORT_FORMAT || !Array.isArray(data.items)) throw new ImportError("notAnExport");
  if (typeof data.version !== "number" || data.version > EXPORT_VERSION) throw new ImportError("newerVersion");
  const entries = data.items.slice(0, MAX_ITEMS);
  const items: SavedItem[] = [];
  const seen = new Set<string>();
  let invalid = data.items.length - entries.length;
  for (const entry of entries) {
    const item = readItem(entry);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    } else if (!item) {
      invalid += 1;
    }
  }
  return { items, invalid, source: "data" };
}

/** A stable id for text with no id of its own, so importing the same file twice adds nothing new. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const LEGACY_HEADING = /^# Reflection - (.*)$/;
const LEGACY_FOOTER = /\n---\nSaved from [^\n]*\s*$/;

/** A Markdown export from before exports carried their data: each reflection kept as text. */
function readLegacyMarkdown(text: string): ImportResult {
  const sections = text.split(/^(?=# Reflection - )/m).filter((section) => LEGACY_HEADING.test(section.split("\n")[0]));
  if (!sections.length) throw new ImportError("notAnExport");
  const items: SavedItem[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const section of sections.slice(0, MAX_ITEMS)) {
    const lines = section.replace(/\r\n/g, "\n").split("\n");
    const date = Date.parse(LEGACY_HEADING.exec(lines[0])?.[1] ?? "");
    const questionAt = lines.findIndex((line) => line.startsWith("> "));
    const question = questionAt >= 0 ? lines[questionAt].slice(2).trim() : "";
    let rest = lines.slice(questionAt >= 0 ? questionAt + 1 : 1).join("\n");
    let note = "";
    const notesAt = rest.indexOf("\n## My notes\n");
    if (notesAt >= 0) {
      note = rest.slice(notesAt + "\n## My notes\n".length).replace(LEGACY_FOOTER, "").trim();
      rest = rest.slice(0, notesAt);
    }
    const body = rest.replace(LEGACY_FOOTER, "").trim();
    if (!question || question.length > MAX_QUESTION || body.length > MAX_TEXT || note.length > MAX_NOTE) {
      invalid += 1;
      continue;
    }
    const id = `text:${fingerprint(`${question}\n${body}`)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      kind: "text",
      id,
      savedAt: new Date(Number.isNaN(date) ? Date.now() : date).toISOString(),
      question,
      body,
      note,
    });
  }
  return { items, invalid, source: "markdown" };
}

/** Reads a file's text into items to import. Throws ImportError when it cannot be read as an export. */
export function parseReflectionsFile(text: string): ImportResult {
  if (!text.trim()) throw new ImportError("empty");
  const open = text.lastIndexOf(DATA_OPEN);
  if (open >= 0) {
    const close = text.indexOf(DATA_CLOSE, open + DATA_OPEN.length);
    if (close < 0) throw new ImportError("unreadable");
    try {
      return readData(JSON.parse(text.slice(open + DATA_OPEN.length, close)));
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError("unreadable");
    }
  }
  if (text.trimStart().startsWith("{")) {
    try {
      return readData(JSON.parse(text));
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError("unreadable");
    }
  }
  return readLegacyMarkdown(text);
}
