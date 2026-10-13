// Types mirroring the API's response models (backend/app/api/views.py and
// backend/app/generation/service.py).

export type ProvenanceStatus = "verified" | "reviewed" | "needs_review" | "unverified";

export interface Citation {
  label: string;
  url: string;
  scan_url: string | null;
  page: string | null;
}

export interface CrossCheck {
  edition: string;
  status: string;
  other_text: string | null;
  detail: string | null;
}

export interface Provenance {
  status: ProvenanceStatus;
  label: string;
  notes: string[];
  cross_checks: CrossCheck[];
}

export interface Note {
  anchor: string | null;
  text: string;
}

export interface Correction {
  field: string;
  printed: string;
  corrected: string;
  applied: boolean;
  basis: string;
}

export interface ConceptRef {
  id: string;
  name: string;
}

export interface Passage {
  id: string;
  ref: string;
  short_ref: string;
  path: string;
  source_id: string;
  source_title: string;
  chapter: number | string | null;
  verse: number | string | null;
  chapter_title: string | null;
  chapter_title_original: string | null;
  speaker: string | null;
  speakers: string[];
  sanskrit: string | null;
  transliteration: string | null;
  transliteration_note: string | null;
  translation: string;
  translator: string;
  citation: Citation;
  provenance: Provenance;
  translator_notes: Note[];
  corrections: Correction[];
  context_notes: string[];
  concepts: ConceptRef[];
}

export interface Division {
  number: number | string;
  title: string | null;
  title_original: string | null;
  passage_count: number;
}

export interface Edition {
  id: string;
  role: string;
  title: string;
  contributors: string;
  year: number | null;
  publisher: string | null;
  license: string;
  url: string;
  notes: string | null;
}

export interface Source {
  id: string;
  title: string;
  title_original: string | null;
  tradition: string;
  description: string;
  division_label: string;
  passage_label: string;
  passage_count: number;
  divisions: Division[];
  editions: Edition[];
}

export interface Chapter {
  source: Source;
  chapter: Division;
  passages: Passage[];
  previous: number | string | null;
  next: number | string | null;
}

export interface RelatedPassage {
  passage: Passage;
  reason: string;
  kind: "theme" | "similar";
}

export interface Concept {
  id: string;
  name: string;
  term: string | null;
  summary: string;
  caveats: string[];
  life_situations: string[];
  related: ConceptRef[];
  passages: Passage[];
  editorial: boolean;
}

export interface PassageDetail {
  passage: Passage;
  before: Passage[];
  after: Passage[];
  related: RelatedPassage[];
  concepts: Concept[];
  stories: { id: string; title: string }[];
}

export interface StoryChoice {
  actor: string;
  choice: string;
  consequence: string | null;
}

export interface Story {
  id: string;
  title: string;
  source_id: string;
  location: string;
  characters: string[];
  summary: string;
  dilemma: string;
  choices: StoryChoice[];
  lessons: string[];
  caveats: string[];
  excerpts: Passage[];
  related: Passage[];
  editorial: boolean;
}

/** Where a cited passage lives: enough to render a citation link. */
export interface PassageLink {
  short_ref: string;
  path: string;
}

export interface SearchResponse {
  query: string;
  results: { passage: Passage; score: number; channels: Record<string, number> }[];
  concepts: { id: string; name: string; via: string }[];
  evidence: string;
}

export interface Health {
  status: string;
  version: string;
  storage: { backend: string; passages: number; embedded: number; concepts: number };
  embedding_model: string;
  llm: { provider: string; configured: boolean; model: string | null; detail: string | null };
}

// --- Answers ----------------------------------------------------------------

export type AnswerKind =
  | "guidance"
  | "follow_up"
  | "clarification"
  | "insufficient_sources"
  | "out_of_scope"
  | "crisis"
  | "retrieval_only";

export interface Teaching {
  passage: Passage;
  what_it_says: string;
  context: string;
  interpretation_notes: string | null;
  why_it_applies: string;
  application: string;
  limits: string;
}

export interface Step {
  title: string;
  detail: string;
  timeframe: "today" | "this_week" | "ongoing" | string;
}

export interface Resource {
  name: string;
  contact: string;
  detail: string;
  url: string | null;
}

export interface Answer {
  id: string;
  kind: AnswerKind;
  language: string;
  situation: string | null;
  teachings: Teaching[];
  path_forward_intro: string | null;
  steps: Step[];
  framework: string | null;
  reflective_question: string | null;
  message: string | null;
  related: { passage: Passage; reason: string }[];
  passages: Passage[];
  evidence: "strong" | "moderate" | "limited" | null;
  evidence_note: string | null;
  alternative_readings: string | null;
  suggested_follow_ups: string[];
  safety: { level: "concern" | "crisis"; message: string | null; resources: Resource[] } | null;
  verification: { checked: boolean; issues: string[]; cited_ids: string[] } | null;
  references: ({ id: string; ref: string } & PassageLink)[];
  generated_by: { provider: string; model: string } | null;
  retrieval: {
    queries: string[];
    concepts: { id: string; name: string; via: string }[];
    evidence: string;
    passage_ids: string[];
  } | null;
  notice: string | null;
  timings_ms: Record<string, number>;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
  passage_ids?: string[];
}

export type Stage = "understanding" | "retrieving" | "writing";

export type FeedbackKind =
  | "incorrect_citation"
  | "irrelevant_passage"
  | "inaccurate_interpretation"
  | "unhelpful_advice"
  | "safety_concern"
  | "helpful"
  | "other";
