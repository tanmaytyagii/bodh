import { ImageResponse } from "next/og";

import { BRAND_COLORS, MARK, markSvg } from "@/lib/brand";

// The favicon, drawn from the mark in lib/brand.ts in its bold weight: a PNG
// on an ivory disc, legible on light and dark tab strips alike, for browsers
// without SVG icons; then the SVG, which follows the browser's appearance.
// Browsers that take the last icon they can use take the SVG.

export function generateImageMetadata() {
  return [
    { id: "png", contentType: "image/png", size: { width: 32, height: 32 } },
    { id: "svg", contentType: "image/svg+xml" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  if ((await id) === "svg") {
    return new Response(markSvg("bold"), { headers: { "content-type": "image/svg+xml" } });
  }
  const mark = MARK.bold;
  const { paper, ink, accent } = BRAND_COLORS.light;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", borderRadius: "50%", background: paper }}>
        <svg viewBox="-2 -2 36 36" width="32" height="32">
          <path d={mark.ring} fill="none" stroke={ink} strokeWidth={mark.ringWidth} strokeLinecap="round" />
          <circle cx={mark.bead.x} cy={mark.bead.y} r={mark.bead.r} fill={accent} />
          <circle cx="16" cy="16" r={mark.core} fill={ink} />
        </svg>
      </div>
    ),
    { width: 32, height: 32 },
  );
}
