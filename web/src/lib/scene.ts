import type { MessageKey } from "./i18n/messages";

// The celestial instrument behind the Ask and Explore pages: modes, framing,
// and the poses it takes through the landing page's scroll story.
//
// Positions are fractions of the stage (the full viewport), so the WebGL
// scene and its static SVG fallback put the instrument in the same place.

export type SceneMode = "hero" | "thinking" | "reading" | "ambient";
export type SceneQuality = "full" | "lite";

export interface Framing {
  /** Centre of the instrument, as fractions of the stage width and height. */
  cx: number;
  cy: number;
  /** Diameter of the whole instrument: fraction of stage height (landscape) or width (portrait). */
  d: number;
  /** Portrait only: the diameter never exceeds this fraction of the stage height. */
  dMax?: number;
}

/** A moment in the landing story: where the instrument is, how it is turned and lit. */
export interface Pose extends Framing {
  /** Turn about the vertical axis, and tilt of the top towards the viewer, in radians. */
  yaw: number;
  pitch: number;
  /** Strength of the inner light (1 = as on arrival). */
  glow: number;
  /** Opacity of the whole stage, so text over it stays easy to read. */
  opacity: number;
}

/**
 * Wide screens (aspect ≥ 1.45), squarer landscape screens, short landscape
 * screens (under 500px tall, such as a phone on its side), and portrait screens.
 */
export type Orientation = "wide" | "square" | "short" | "portrait";

export function orientationFor(aspect: number, height: number): Orientation {
  if (aspect < 1) return "portrait";
  if (aspect < 1.45) return "square";
  return height < 500 ? "short" : "wide";
}

/** The chapters of the landing story, in order. Each is a section with this id. */
export const STORY_CHAPTERS = [
  { id: "invitation", label: "landing.invitation.label" },
  { id: "teachings", label: "landing.teachings.label" },
  { id: "themes", label: "nav.themes" },
  { id: "understanding", label: "landing.understanding.label" },
  { id: "return", label: "landing.return.label" },
] as const satisfies readonly { id: string; label: MessageKey }[];

/** A chapter's place in the story. */
export function chapterIndex(id: (typeof STORY_CHAPTERS)[number]["id"]): number {
  return STORY_CHAPTERS.findIndex((chapter) => chapter.id === id);
}

const p = (cx: number, cy: number, d: number, yaw: number, pitch: number, glow: number, opacity: number, dMax?: number): Pose => ({
  cx,
  cy,
  d,
  dMax,
  yaw,
  pitch,
  glow,
  opacity,
});

// The story, chapter by chapter: arrival beside the headline and the question
// box; vast and faint behind the passages; turning beside the themes; rising
// from the lower right while the method is told, below its step list and its
// example; and back where it began for the return.
export const STORY_POSES: Record<Orientation, Pose[]> = {
  wide: [
    p(0.7, 0.54, 0.84, 0, 0.2, 1, 1),
    p(0.56, 0.8, 2, 0.4, 0.12, 0.3, 0.22),
    p(0.84, 0.58, 0.95, 0.9, 0.3, 0.9, 0.55),
    p(0.84, 1.22, 0.8, 1.6, 0.45, 0.8, 0.45),
    p(0.7, 0.52, 0.84, 0, 0.22, 1.1, 1),
  ],
  square: [
    p(0.76, 0.37, 0.56, 0, 0.2, 1, 1),
    p(0.56, 0.78, 1.8, 0.4, 0.12, 0.3, 0.22),
    p(0.86, 0.3, 0.56, 0.9, 0.3, 0.9, 0.5),
    p(0.86, 1.2, 0.68, 1.6, 0.45, 0.8, 0.4),
    p(0.76, 0.37, 0.56, 0, 0.22, 1.1, 1),
  ],
  short: [
    p(0.8, 0.56, 0.66, 0, 0.2, 1, 1),
    p(0.6, 0.72, 2, 0.4, 0.12, 0.3, 0.22),
    p(0.86, 0.56, 0.7, 0.9, 0.3, 0.9, 0.45),
    p(0.88, 0.6, 0.6, 1.6, 0.45, 0.8, 0.35),
    p(0.8, 0.56, 0.66, 0, 0.22, 1.1, 1),
  ],
  portrait: [
    p(0.5, 0.2, 0.5, 0, 0.2, 1, 1, 0.2),
    p(0.5, 0.88, 2, 0.4, 0.12, 0.3, 0.2, 1.1),
    p(0.82, 0.18, 0.5, 0.9, 0.3, 0.9, 0.4, 0.22),
    p(0.82, 1.05, 0.9, 1.6, 0.45, 0.8, 0.35, 0.5),
    p(0.5, 0.2, 0.5, 0, 0.22, 1.1, 1, 0.2),
  ],
};

// Away from the landing story the instrument rests to the right and below the
// header, so it never sits behind the navigation.
export const SCENE_FRAMING: Record<SceneMode, Record<Orientation, Framing>> = {
  hero: {
    wide: STORY_POSES.wide[0],
    square: STORY_POSES.square[0],
    short: STORY_POSES.short[0],
    portrait: STORY_POSES.portrait[0],
  },
  thinking: {
    wide: { cx: 0.86, cy: 0.36, d: 0.5 },
    square: { cx: 0.85, cy: 0.32, d: 0.44 },
    short: { cx: 0.86, cy: 0.56, d: 0.6 },
    portrait: { cx: 0.82, cy: 0.16, d: 0.36, dMax: 0.17 },
  },
  reading: {
    wide: { cx: 0.88, cy: 0.34, d: 0.46 },
    square: { cx: 0.87, cy: 0.31, d: 0.4 },
    short: { cx: 0.88, cy: 0.56, d: 0.54 },
    portrait: { cx: 0.84, cy: 0.16, d: 0.32, dMax: 0.15 },
  },
  ambient: {
    wide: { cx: 0.74, cy: 0.47, d: 0.78 },
    square: { cx: 0.8, cy: 0.34, d: 0.6 },
    short: { cx: 0.84, cy: 0.56, d: 0.64 },
    // On a phone, below the search box, so the search comes first.
    portrait: { cx: 0.78, cy: 0.76, d: 0.5, dMax: 0.26 },
  },
};

/** How visible the stage is in each mode (the scene recedes while you read). */
export const SCENE_OPACITY: Record<SceneMode, number> = {
  hero: 1,
  thinking: 0.85,
  reading: 0.5,
  ambient: 0.55,
};

/** The content frame of Explore (96rem): on wider screens the instrument keeps to it. */
export const FRAME_WIDTH = 1536;
/** The conversation's reading column (46rem). */
export const COLUMN_WIDTH = 736;
/** The conversation keeps the instrument beside its column from this width up. */
export const BESIDE_FROM = 1280;
/**
 * The same breakpoint as the media query that globals.css and the column's
 * spacing (xl:) use. A media query measures the whole window, while a classic
 * scrollbar leaves the page and the stage up to 17px narrower, so the scene
 * asks this query instead of comparing its own width with BESIDE_FROM.
 */
export const BESIDE_QUERY = `(min-width: ${BESIDE_FROM}px)`;

/**
 * The landing page's shell, in pixels: the whole width of the screen, except
 * on ultrawide screens, where the composition keeps to 1.85 times the height
 * (and never to less than 80rem). The same rule is `--shell` in globals.css.
 */
export function shellWidth(width: number, height: number): number {
  return Math.min(width, Math.max(1280, height * 1.85));
}

/**
 * A horizontal position given as a fraction of the screen, held within a
 * content frame `frame` pixels wide on screens wider than it, so the
 * instrument never drifts away from the text it belongs with.
 */
export function frameCx(cx: number, width: number, frame: number): number {
  return 0.5 + (cx - 0.5) * Math.min(1, frame / width);
}

/** The invitation's visual region, in page pixels: its centre, and its side (the instrument's diameter). */
export interface HeroFrame {
  x: number;
  y: number;
  size: number;
}

/**
 * Where the instrument rests beside a conversation, in pixels of the stage: in
 * the margin to the right of the reading column when `beside` (BESIDE_QUERY
 * matches), otherwise small and centred above the question (the conversation
 * leaves space for it there, as COLUMN in Conversation.tsx). `width` and `height` are the stage's own size,
 * in which the reading column is centred. The same arithmetic places the still
 * drawing, in globals.css.
 */
export function conversationFraming(
  mode: "thinking" | "reading",
  width: number,
  height: number,
  beside: boolean,
): { x: number; y: number; size: number; beside: boolean } {
  const header = 64;
  const left = width / 2 + COLUMN_WIDTH / 2 + 40;
  const room = width - 32 - left;
  if (beside) {
    const size = Math.min(room, height * (mode === "thinking" ? 0.42 : 0.36), 440);
    return { x: left + room / 2, y: header + 32 + size / 2, size, beside: true };
  }
  // Small above the question, so the answer itself starts on the first screen of a phone.
  const size = Math.min(width * 0.2, height * 0.1, 96);
  return { x: width / 2, y: header + 8 + size / 2, size, beside: false };
}

/** World-space radius of the meridian ring, and of the whole instrument (bowl included). */
export const OUTER_RADIUS = 1.6;
export const INSTRUMENT_RADIUS = 2.25;
export const CAMERA_FOV = 30;
export const CAMERA_Z = 8;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The pose at a point in the story: `position` is the chapter index plus the
 * progress towards the next. A pose holds for the first part of its chapter,
 * then eases into the next one.
 *
 * Given the screen (`view`), the poses are placed on it: the opening one fills
 * the invitation's visual region once it has been measured, and the others
 * keep within the landing page's shell.
 */
export function storyPose(
  position: number,
  orientation: Orientation,
  view?: { width: number; height: number; hero: HeroFrame | null },
): Pose {
  const poses = view ? placedPoses(orientation, view) : STORY_POSES[orientation];
  const last = poses.length - 1;
  const clamped = Math.min(last, Math.max(0, position));
  const i = Math.min(last, Math.floor(clamped));
  const j = Math.min(last, i + 1);
  const t = smoothstep(0.2, 0.85, clamped - i);
  const a = poses[i];
  const b = poses[j];
  return {
    cx: mix(a.cx, b.cx, t),
    cy: mix(a.cy, b.cy, t),
    d: mix(a.d, b.d, t),
    dMax: a.dMax !== undefined && b.dMax !== undefined ? mix(a.dMax, b.dMax, t) : undefined,
    yaw: mix(a.yaw, b.yaw, t),
    pitch: mix(a.pitch, b.pitch, t),
    glow: mix(a.glow, b.glow, t),
    opacity: mix(a.opacity, b.opacity, t),
  };
}

function placedPoses(orientation: Orientation, view: { width: number; height: number; hero: HeroFrame | null }): Pose[] {
  const { width, height, hero } = view;
  const shell = shellWidth(width, height);
  return STORY_POSES[orientation].map((pose, i) => {
    if (i === 0 && hero) {
      return {
        ...pose,
        cx: hero.x / width,
        cy: hero.y / height,
        // Portrait poses give the diameter as a fraction of the width, capped by the height.
        d: orientation === "portrait" ? hero.size / width : hero.size / height,
        dMax: orientation === "portrait" ? hero.size / height : undefined,
      };
    }
    return { ...pose, cx: frameCx(pose.cx, width, shell) };
  });
}

/** CSS custom properties that place the SVG fallback where the 3D instrument will be. */
export function framingStyle(mode: SceneMode): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, f] of Object.entries(SCENE_FRAMING[mode]) as [Orientation, Framing][]) {
    vars[`--scene-cx-${key}`] = String(f.cx);
    vars[`--scene-cy-${key}`] = String(f.cy);
    vars[`--scene-d-${key}`] = String(f.d);
    if (f.dMax) vars[`--scene-dmax-${key}`] = String(f.dMax);
  }
  return vars;
}
