/**
 * The observatory as a still drawing. It is part of the server HTML, so the
 * first paint is complete before any 3D code loads, and it stays in place on
 * devices without WebGL. Its geometry mirrors the 3D scene, seen from slightly
 * above: the whole instrument has a radius of 180 inside a 400 × 400 box (80
 * units to one world unit), so the box is 10/9 of the instrument's diameter.
 */

// Rounded, because the server and the browser can disagree in the last digit
// of a sine, and the HTML they write must match exactly.
const round = (n: number) => Math.round(n * 100) / 100;

// Graduations on the meridian, squashed like the meridian ellipse (115 / 128).
const MERIDIAN_TICKS = Array.from({ length: 72 }, (_, i) => {
  const angle = (i / 72) * Math.PI * 2;
  const r1 = 131;
  const r2 = i % 6 === 0 ? 142 : 136;
  return {
    x1: round(Math.cos(angle) * r1 * 0.9),
    y1: round(Math.sin(angle) * r1),
    x2: round(Math.cos(angle) * r2 * 0.9),
    y2: round(Math.sin(angle) * r2),
  };
});

// The 27 nakshatras on the rim of the bowl, an ellipse 176 × 35 seen from above.
const RIM_TICKS = Array.from({ length: 27 }, (_, i) => {
  const angle = (i / 27) * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return {
    x1: round(x * 179),
    y1: round(y * 36),
    x2: round(x * 190),
    y2: round(y * 38),
  };
});

// Circles of altitude engraved in the bowl: [height below the rim, radius].
const BOWL_CIRCLES: [number, number][] = [
  [30, 173],
  [77, 158],
  [127, 122],
  [163, 66],
];

/** `name` keeps the drawing's gradient ids unique when the page has more than one. */
export function SceneFallback({ className = "", name = "scene" }: { className?: string; name?: string }) {
  return (
    <svg viewBox="-200 -200 400 400" className={`scene-fallback ${className}`} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${name}-halo`}>
          <stop offset="0" style={{ stopColor: "var(--scene-glow)", stopOpacity: 0.55 }} />
          <stop offset="0.35" style={{ stopColor: "var(--scene-glow)", stopOpacity: 0.16 }} />
          <stop offset="1" style={{ stopColor: "var(--scene-glow)", stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={`${name}-core`} cx="0.42" cy="0.4">
          <stop offset="0" style={{ stopColor: "var(--scene-core)" }} />
          <stop offset="0.7" style={{ stopColor: "var(--scene-glow)" }} />
          <stop offset="1" style={{ stopColor: "var(--scene-ring)" }} />
        </radialGradient>
      </defs>
      <circle r="110" fill={`url(#${name}-halo)`} />
      <g fill="none" strokeLinecap="round" style={{ stroke: "var(--scene-ring)" }}>
        {/* The bowl: its engraved hemisphere, the hour lines, and the divided rim. */}
        <g opacity="0.55">
          {BOWL_CIRCLES.map(([y, r]) => (
            <ellipse key={y} cy={y} rx={r} ry={round(r * 0.2)} strokeWidth="0.8" />
          ))}
          <path d="M -152 0 A 152 172 0 0 0 152 0" strokeWidth="0.8" />
          <path d="M -88 0 A 88 172 0 0 0 88 0" strokeWidth="0.8" />
          <path d="M -176 0 A 176 172 0 0 0 176 0" strokeWidth="1" />
        </g>
        <ellipse rx="176" ry="35" strokeWidth="2.2" />
        {RIM_TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth="1" opacity="0.7" />
        ))}
        {/* The axis, from the pivot in the bowl to the finial. */}
        <line x1="0" y1="-164" x2="0" y2="176" strokeWidth="1.2" />
        {/* The sphere: meridian, equator, ecliptic and inner orbits. */}
        <ellipse rx="115" ry="128" strokeWidth="2.2" />
        {MERIDIAN_TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth="0.8" opacity="0.7" />
        ))}
        <ellipse rx="126" ry="25" strokeWidth="1.5" />
        <ellipse rx="116" ry="44" strokeWidth="1.3" transform="rotate(-16)" />
        <ellipse rx="90" ry="36" strokeWidth="1.1" transform="rotate(34)" />
        <ellipse rx="62" ry="46" strokeWidth="0.9" transform="rotate(-58)" opacity="0.8" />
      </g>
      <circle cy="-164" r="4" style={{ fill: "var(--scene-ring)" }} />
      <circle cy="176" r="4.8" style={{ fill: "var(--scene-ring)" }} />
      <circle cx="98" cy="-30" r="3.6" style={{ fill: "var(--scene-core)" }} />
      <circle cx="-60" cy="40" r="2.7" style={{ fill: "var(--scene-core)" }} />
      <circle r="22" fill={`url(#${name}-core)`} />
    </svg>
  );
}
