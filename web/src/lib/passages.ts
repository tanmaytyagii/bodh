import type { MessageKey } from "./i18n/messages";
import type { Passage, PassageLink } from "./types";

// Passage ids are "<prefix>.<division>.<verse>". Answers carry the link for
// every passage they cite; this map is the fallback for ids seen elsewhere.
const SOURCE_FOR_PREFIX: Record<string, { source: string; label: string }> = {
  bg: { source: "bhagavad-gita", label: "BG" },
  isha: { source: "isha-upanishad", label: "Isha" },
  katha: { source: "katha-upanishad", label: "Katha" },
  kena: { source: "kena-upanishad", label: "Kena" },
};

const ID = /^([a-z]+)\.(\d+)\.(\d+)$/i;

export function passageHref(id: string, known?: PassageLink): string | null {
  if (known) return known.path;
  const match = ID.exec(id);
  const entry = match ? SOURCE_FOR_PREFIX[match[1].toLowerCase()] : undefined;
  return match && entry ? `/scripture/${entry.source}/${match[2]}/${match[3]}` : null;
}

export function passageLabel(id: string, known?: PassageLink): string {
  if (known) return known.short_ref;
  const match = ID.exec(id);
  const entry = match ? SOURCE_FOR_PREFIX[match[1].toLowerCase()] : undefined;
  return match && entry ? `${entry.label} ${match[2]}.${match[3]}` : id;
}

/** "Chapter 2" or "Part 1", as an interface message, from a source's division label. */
export function divisionKey(label: string): "verse.chapter" | "verse.part" {
  return label.toLowerCase() === "chapter" ? "verse.chapter" : "verse.part";
}

// The Gita's speakers, and to whom each speaks.
const SPEAKER_LINES: Record<string, MessageKey> = {
  Krishna: "speaker.krishna",
  Arjuna: "speaker.arjuna",
  Sanjaya: "speaker.sanjaya",
  Dhritarashtra: "speaker.dhritarashtra",
};

const SPEAKER_NAMES: Record<string, MessageKey> = {
  Krishna: "speaker.name.krishna",
  Arjuna: "speaker.name.arjuna",
  Sanjaya: "speaker.name.sanjaya",
  Dhritarashtra: "speaker.name.dhritarashtra",
};

/** A speaker's name as an interface message, for the names the interface knows how to write in Hindi. */
export function speakerNameKey(name: string): MessageKey | undefined {
  return SPEAKER_NAMES[name];
}

/** Who is speaking, as an interface message: "Krishna, to Arjuna", or "Yama speaking". */
export function speakerMessage(passage: Passage): { key: MessageKey; values?: { who: string } } | null {
  const speakers = passage.speakers.length ? passage.speakers : passage.speaker ? [passage.speaker] : [];
  if (!speakers.length) return null;
  const known = speakers.length === 1 ? SPEAKER_LINES[speakers[0]] : undefined;
  return known ? { key: known } : { key: "speaker.other", values: { who: speakers.join(", ") } };
}
