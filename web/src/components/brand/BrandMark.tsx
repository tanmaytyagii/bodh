import { MARK, type MarkWeight } from "@/lib/brand";

/**
 * The BODH mark: a ring, its still centre, and a bead of light just risen on
 * the ring (geometry in lib/brand.ts). The ring and centre take the text
 * colour; the bead is saffron, or the text colour too with `mono`. With
 * `orbit` the bead travels the ring, for a moment of waiting; with reduced
 * motion it stays where it rises. Decorative: whatever carries it says what it is.
 */
export function BrandMark({
  className = "size-8",
  weight = "regular",
  mono = false,
  orbit = false,
}: {
  className?: string;
  weight?: MarkWeight;
  mono?: boolean;
  orbit?: boolean;
}) {
  const mark = MARK[weight];
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={`shrink-0 ${className}`}>
      <g className={orbit ? "mark-orbit" : undefined}>
        <path d={mark.ring} fill="none" stroke="currentColor" strokeWidth={mark.ringWidth} strokeLinecap="round" />
        <circle cx={mark.bead.x} cy={mark.bead.y} r={mark.bead.r} className={mono ? "fill-current" : "fill-accent"} />
      </g>
      <circle cx="16" cy="16" r={mark.core} fill="currentColor" />
    </svg>
  );
}
