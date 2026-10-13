import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";

import { BRAND, BRAND_COLORS, DEFAULT_TITLE, MARK, markGeometry } from "@/lib/brand";

// The link preview, for every page that has none of its own: the name and its
// line on charcoal, beside the mark drawn large and fine, like the instrument
// on the site. The type is the site's own, fetched from Google Fonts while the
// image is built and cut to the letters it needs. Without it the image still
// renders, in the default face and without the Devanagari.

export const alt = DEFAULT_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SOURCES = "Bhagavad Gita · Upanishads";
const { paper, ink, muted, accent, gold } = BRAND_COLORS.dark;

/** A Google font cut to `text`, as TrueType (what ImageResponse reads), or null. */
async function googleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const query = `family=${encodeURIComponent(family)}&text=${encodeURIComponent(text)}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(8000) });
    const url = (await css.text()).match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!css.ok || !url) return null;
    const font = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// Fetched when the image is first drawn, not when this module loads: Next.js
// reads the module for every page's metadata. The fonts never change, so they
// are kept for as long as Next.js allows.
async function fonts() {
  "use cache";
  cacheLife("max");
  const [serif, sans, deva] = await Promise.all([
    googleFont("Instrument Serif", `${BRAND.name}${BRAND.tagline}`),
    googleFont("Geist", `${SOURCES.toUpperCase()}${BRAND.philosophy}`),
    BRAND.devanagari ? googleFont("Tiro Devanagari Sanskrit", BRAND.devanagari) : null,
  ]);
  return { serif, sans, deva };
}

// The tagline, a sentence to a line.
const TAGLINE = BRAND.tagline.split(/(?<=\.)\s+/);

// The mark drawn fine: a thin ring and a small bead, with engraved circles
// around it and the 27 divisions of the instrument's rim.
const FINE = markGeometry(12, 0.15, 1.1, 1.1, 0.8);
const TICKS = Array.from({ length: 27 }, (_, i) => {
  const angle = (i / 27) * Math.PI * 2;
  const r1 = 14.25;
  const r2 = i % 3 === 0 ? 15.1 : 14.75;
  const at = (r: number) => [16 + r * Math.cos(angle), 16 + r * Math.sin(angle)].map((n) => Math.round(n * 100) / 100);
  return [...at(r1), ...at(r2)];
});

export default async function OpenGraphImage() {
  const { serif, sans, deva } = await fonts();
  const loaded = (
    [
      ["Instrument Serif", serif],
      ["Geist", sans],
      ["Tiro Devanagari Sanskrit", deva],
    ] as const
  ).flatMap(([name, data]) => (data ? [{ name, data, weight: 400 as const, style: "normal" as const }] : []));
  const mark = MARK.regular;
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          background: paper,
          color: ink,
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            // The scene's atmosphere: the accent, faint, around the instrument.
            background: "radial-gradient(circle at 79% 50%, rgba(234, 162, 79, 0.13) 0%, rgba(234, 162, 79, 0) 42%)",
          }}
        />
        <svg viewBox="0 0 32 32" width="660" height="660" style={{ position: "absolute", left: 620, top: -15 }}>
          <defs>
            {/* The core glows like the instrument's (--scene-core in the dark theme). */}
            <radialGradient id="core">
              <stop offset="0" stopColor="#fff3d6" />
              <stop offset="0.45" stopColor={accent} stopOpacity="0.9" />
              <stop offset="1" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glow">
              <stop offset="0" stopColor={accent} stopOpacity="0.55" />
              <stop offset="1" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="14.25" fill="none" stroke={gold} strokeOpacity="0.22" strokeWidth="0.05" />
          {TICKS.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold} strokeOpacity="0.35" strokeWidth="0.05" />
          ))}
          <circle cx="16" cy="16" r="8.4" fill="none" stroke={ink} strokeOpacity="0.1" strokeWidth="0.04" />
          <path d={FINE.ring} fill="none" stroke={ink} strokeOpacity="0.85" strokeWidth={FINE.ringWidth} strokeLinecap="round" />
          <circle cx={FINE.bead.x} cy={FINE.bead.y} r="3.2" fill="url(#glow)" />
          <circle cx={FINE.bead.x} cy={FINE.bead.y} r={FINE.bead.r} fill={accent} />
          <circle cx="16" cy="16" r="2.6" fill="url(#core)" />
        </svg>

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: "76px 88px 80px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 32 32" width="56" height="56">
              <path d={mark.ring} fill="none" stroke={ink} strokeWidth={mark.ringWidth} strokeLinecap="round" />
              <circle cx={mark.bead.x} cy={mark.bead.y} r={mark.bead.r} fill={accent} />
              <circle cx="16" cy="16" r={mark.core} fill={ink} />
            </svg>
            <div style={{ marginLeft: 20, fontFamily: "Instrument Serif", fontSize: 46, letterSpacing: 7.4, lineHeight: 1 }}>
              {BRAND.name}
            </div>
            {deva && BRAND.devanagari && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 1.5, height: 34, marginLeft: 14, marginRight: 22, background: "rgba(238, 234, 226, 0.25)" }} />
                <div lang="hi" style={{ fontFamily: "Tiro Devanagari Sanskrit", fontSize: 40, lineHeight: 1, color: muted }}>
                  {BRAND.devanagari}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 21, letterSpacing: 3.4, color: accent }}>
              <div style={{ width: 44, height: 1.5, marginRight: 18, background: accent }} />
              {SOURCES.toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontFamily: "Instrument Serif", fontSize: 98, lineHeight: 1 }}>
              {TAGLINE.map((line, i) => (
                <div key={line} style={{ color: i === TAGLINE.length - 1 ? accent : ink }}>
                  {line}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 30, fontSize: 28, color: muted }}>{BRAND.philosophy}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: loaded.length ? loaded : undefined },
  );
}
