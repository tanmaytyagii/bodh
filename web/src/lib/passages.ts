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

export function speakerLine(passage: Passage): string | null {
  const speakers = passage.speakers.length ? passage.speakers : passage.speaker ? [passage.speaker] : [];
  if (!speakers.length) return null;
  if (speakers.length > 1) return `${speakers.join(", then ")} speaking`;
  const who = speakers[0];
  if (who === "Krishna") return "Krishna, to Arjuna";
  if (who === "Arjuna") return "Arjuna, to Krishna";
  if (who === "Sanjaya") return "Sanjaya, narrating to Dhritarashtra";
  return `${who} speaking`;
}
