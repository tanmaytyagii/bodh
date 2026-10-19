// A shareable image of one passage: its reference, the Sanskrit and
// transliteration as printed, the translation with its attribution, and the
// name and address of this site. Only the passage: never a question, a note
// or anything from a conversation.
//
// It is drawn in the browser, on a canvas, with the page's own web fonts, so
// Devanagari is shaped by the browser exactly as it is on the page. Long
// passages are set smaller until they fit, and the card grows to at most a
// 9:16 portrait.

import { BRAND, BRAND_COLORS } from "./brand";
import type { Passage } from "./types";

export interface VerseImageLabels {
  /** "Source text" */
  source: string;
  /** "Krishna, to Arjuna · Chapter 2: …" */
  meta: string;
  /** "Translated by Annie Besant (1922)" */
  attribution: string;
}

const WIDTH = 1080;
const MIN_HEIGHT = 1080;
const MAX_HEIGHT = 1920;
const PAD = 104;

interface Block {
  lines: string[];
  font: string;
  size: number;
  lineHeight: number;
  color: string;
  align: "left" | "center";
  gap: number;
  kind?: "ornament";
}

function cssFamily(variable: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= width) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function renderVerseImage(
  passage: Passage,
  labels: VerseImageLabels,
  options: { theme: "light" | "dark"; url: string },
): Promise<Blob> {
  const colors = BRAND_COLORS[options.theme];
  const deva = cssFamily("--font-tiro", "serif");
  const serif = cssFamily("--font-literata", "Georgia, serif");
  const display = cssFamily("--font-instrument", "Georgia, serif");
  const sans = cssFamily("--font-geist-sans", "system-ui, sans-serif");

  // Wait for the faces the card uses, with the characters it needs.
  await Promise.all([
    document.fonts.load(`60px ${display}`, passage.ref),
    document.fonts.load(`34px ${serif}`, passage.translation.slice(0, 80)),
    passage.transliteration ? document.fonts.load(`italic 26px ${serif}`, passage.transliteration.slice(0, 80)) : null,
    passage.sanskrit ? document.fonts.load(`44px ${deva}`, passage.sanskrit.slice(0, 80)) : null,
    document.fonts.load(`24px ${sans}`, labels.meta),
    BRAND.devanagari ? document.fonts.load(`30px ${deva}`, BRAND.devanagari) : null,
  ]).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  const inner = WIDTH - PAD * 2;

  const layout = (scale: number) => {
    const blocks: Block[] = [];
    const add = (text: string, font: string, size: number, lineHeight: number, color: string, align: Block["align"], gap: number) => {
      context.font = font.replace("{size}", String(size));
      blocks.push({ lines: wrap(context, text, inner), font, size, lineHeight, color, align, gap });
    };
    add(labels.source.toUpperCase(), `600 {size}px ${sans}`, Math.round(20 * scale), 1.4, colors.accent, "left", 0);
    add(passage.ref, `400 {size}px ${display}`, Math.round(62 * scale), 1.15, colors.ink, "left", 18 * scale);
    if (labels.meta) add(labels.meta, `400 {size}px ${sans}`, Math.round(23 * scale), 1.4, colors.muted, "left", 10 * scale);
    if (passage.sanskrit) {
      add(passage.sanskrit, `400 {size}px ${deva}`, Math.round(44 * scale), 1.8, colors.ink, "center", 54 * scale);
    }
    if (passage.transliteration) {
      add(passage.transliteration, `italic 400 {size}px ${serif}`, Math.round(25 * scale), 1.55, colors.muted, "center", 18 * scale);
    }
    if (passage.sanskrit) {
      blocks.push({ lines: [""], font: "", size: Math.round(24 * scale), lineHeight: 1, color: colors.gold, align: "center", gap: 40 * scale, kind: "ornament" });
    }
    add(`“${passage.translation}”`, `400 {size}px ${serif}`, Math.round(35 * scale), 1.55, colors.ink, "left", 44 * scale);
    add(labels.attribution, `400 {size}px ${sans}`, Math.round(22 * scale), 1.45, colors.muted, "left", 32 * scale);
    const contentHeight = blocks.reduce((sum, b) => sum + b.gap + b.lines.length * b.size * b.lineHeight, 0);
    return { blocks, contentHeight };
  };

  const footer = 120;
  let scale = 1;
  let result = layout(scale);
  while (PAD * 2 + footer + result.contentHeight > MAX_HEIGHT && scale > 0.6) {
    scale -= 0.07;
    result = layout(scale);
  }
  const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.ceil(PAD * 2 + footer + result.contentHeight)));
  canvas.height = height;

  // Paper, and a fine inner frame like the verse plate's.
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, WIDTH, height);
  context.strokeStyle = colors.gold;
  context.globalAlpha = 0.35;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(30, 30, WIDTH - 60, height - 60, 36);
  context.stroke();
  context.globalAlpha = 1;

  // Content, centred in the space above the footer.
  let y = PAD + Math.max(0, (height - PAD * 2 - footer - result.contentHeight) / 2);
  context.textBaseline = "middle";
  for (const block of result.blocks) {
    y += block.gap;
    const lineBox = block.size * block.lineHeight;
    if (block.kind === "ornament") {
      const middle = y + lineBox / 2;
      context.strokeStyle = block.color;
      context.fillStyle = block.color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(WIDTH / 2 - 110, middle);
      context.lineTo(WIDTH / 2 - 22, middle);
      context.moveTo(WIDTH / 2 + 22, middle);
      context.lineTo(WIDTH / 2 + 110, middle);
      context.stroke();
      context.beginPath();
      context.moveTo(WIDTH / 2, middle - 9);
      context.lineTo(WIDTH / 2 + 9, middle);
      context.lineTo(WIDTH / 2, middle + 9);
      context.lineTo(WIDTH / 2 - 9, middle);
      context.closePath();
      context.fill();
      y += lineBox;
      continue;
    }
    context.font = block.font.replace("{size}", String(block.size));
    context.fillStyle = block.color;
    context.textAlign = block.align;
    for (const line of block.lines) {
      context.fillText(line, block.align === "center" ? WIDTH / 2 : PAD, y + lineBox / 2);
      y += lineBox;
    }
  }

  // Footer: the name, and where the passage can be read.
  const base = height - PAD + 8;
  context.strokeStyle = colors.muted;
  context.globalAlpha = 0.3;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(PAD, base - 56);
  context.lineTo(WIDTH - PAD, base - 56);
  context.stroke();
  context.globalAlpha = 1;
  context.textAlign = "left";
  context.fillStyle = colors.ink;
  context.font = `400 34px ${display}`;
  context.fillText(BRAND.name, PAD, base);
  let x = PAD + context.measureText(BRAND.name).width;
  if (BRAND.devanagari) {
    context.fillStyle = colors.muted;
    context.font = `400 28px ${deva}`;
    context.fillText(`  ${BRAND.devanagari}`, x, base + 2);
    x += context.measureText(`  ${BRAND.devanagari}`).width;
  }
  context.textAlign = "right";
  context.fillStyle = colors.muted;
  context.font = `400 20px ${sans}`;
  const address = options.url.replace(/^https?:\/\//, "");
  const room = WIDTH - PAD - x - 32;
  context.fillText(context.measureText(address).width <= room ? address : new URL(options.url).pathname, WIDTH - PAD, base);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be made."))), "image/png"),
  );
}
