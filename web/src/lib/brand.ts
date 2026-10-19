// The product's identity in one place: its name in Latin and Devanagari, its
// lines, the description used for search and link previews, and the mark.
// Change it here and it changes everywhere: the navigation and the footer,
// page titles and social previews, the icons, and exported reflections.

const DEFAULT_NAME = "BODH";

/**
 * NEXT_PUBLIC_APP_NAME (read at build time) can still replace the name for a
 * deployment of its own. The Devanagari lines spell this name, so they are
 * shown only with it.
 */
const name = process.env.NEXT_PUBLIC_APP_NAME?.trim() || DEFAULT_NAME;
const ownName = name === DEFAULT_NAME;

export const BRAND = {
  name,
  /** बोध: understanding, awareness, discernment, insight. Shown beside the name where there is room. */
  devanagari: ownName ? "बोध" : null,
  /**
   * The one slogan: the invitation's headline, the title of the home page,
   * the footer and the link preview. (In the Hindi interface: brand.tagline.)
   */
  tagline: "Ancient wisdom. Your life, today.",
  /**
   * The one supporting line, after the slogan: the landing story's close, About
   * and the link preview. From the Gita's own end: reflect fully, then choose (18.63).
   */
  philosophy: "Understand deeply. Choose consciously.",
  /** For search results and link previews. */
  description:
    "Bring a real-life situation to the Bhagavad Gita and the Upanishads. Read verified passages with the " +
    "Sanskrit and citations you can check, understand what they offer, and choose your own way forward.",
  /** The start of file names, as in "bodh-reflections.md" (empty if the name has no Latin letters). */
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
};

/** The title of the home page, and of any page without its own. */
export const DEFAULT_TITLE = `${BRAND.name} — ${BRAND.tagline}`;

/*
 * The mark: a ring, its still centre, and a bead of light on the ring, just
 * risen above its left horizon (east, on a chart of the sky). The whole of a
 * teaching, the understanding at its heart, and the moment of discovery. It
 * shares the instrument's language — a ring, a bead keeping time, a glowing
 * core — without drawing the instrument.
 *
 * Drawn on a 32-unit square. "regular" is for 24px and up; "bold" thickens
 * everything for favicons, where thin lines blur. The ring is an arc that
 * leaves a gap around the bead, so the mark needs no mask and draws the same
 * in the page, in the icons and in the link preview.
 */

export type MarkWeight = "regular" | "bold";

export interface MarkGeometry {
  /** The ring, as an SVG path. */
  ring: string;
  ringWidth: number;
  bead: { x: number; y: number; r: number };
  core: number;
}

const CENTRE = 16;
const BEAD_ANGLE = (-160 * Math.PI) / 180;

// Rounded, because the server and the browser can disagree in the last digit
// of a sine, and the HTML they write must match exactly.
const round = (n: number) => Math.round(n * 100) / 100;

/** The mark's ring, bead and centre, for a ring of `radius` on the 32-unit square. */
export function markGeometry(radius: number, ringWidth: number, bead: number, clearance: number, core: number): MarkGeometry {
  const at = (angle: number) => `${round(CENTRE + radius * Math.cos(angle))} ${round(CENTRE + radius * Math.sin(angle))}`;
  // Half the gap, as an angle: room for the bead and its clearance, plus the round cap.
  const half = Math.asin((bead + clearance) / (2 * radius)) * 2 + ringWidth / 2 / radius;
  return {
    ring: `M ${at(BEAD_ANGLE + half)} A ${radius} ${radius} 0 1 1 ${at(BEAD_ANGLE - half)}`,
    ringWidth,
    bead: {
      x: round(CENTRE + radius * Math.cos(BEAD_ANGLE)),
      y: round(CENTRE + radius * Math.sin(BEAD_ANGLE)),
      r: bead,
    },
    core,
  };
}

export const MARK: Record<MarkWeight, MarkGeometry> = {
  regular: markGeometry(12, 1.8, 3.5, 1.9, 2),
  bold: markGeometry(11.6, 2.6, 4.2, 2.2, 2.6),
};

/**
 * Colours for the icons and the link preview, which are images and cannot
 * read the page's tokens. They match globals.css: ink and saffron on ivory,
 * ivory and gold on charcoal.
 */
export const BRAND_COLORS = {
  light: { paper: "#f8f6f1", ink: "#16171a", muted: "#63656c", accent: "#a6510d", gold: "#a8741f" },
  dark: { paper: "#0f1012", ink: "#eeeae2", muted: "#8f9198", accent: "#eaa24f", gold: "#d9a548" },
} as const;

/**
 * The mark as a standalone SVG document, for the favicon. Without a
 * background, it follows the browser's light or dark appearance.
 */
export function markSvg(weight: MarkWeight = "bold"): string {
  const m = MARK[weight];
  const { light, dark } = BRAND_COLORS;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`,
    `<style>.r{fill:none;stroke:${light.ink}}.c{fill:${light.ink}}.b{fill:${light.accent}}`,
    `@media (prefers-color-scheme:dark){.r{stroke:${dark.ink}}.c{fill:${dark.ink}}.b{fill:${dark.accent}}}</style>`,
    `<path class="r" d="${m.ring}" stroke-width="${m.ringWidth}" stroke-linecap="round"/>`,
    `<circle class="b" cx="${m.bead.x}" cy="${m.bead.y}" r="${m.bead.r}"/>`,
    `<circle class="c" cx="${CENTRE}" cy="${CENTRE}" r="${m.core}"/>`,
    `</svg>`,
  ].join("");
}
