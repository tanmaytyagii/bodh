import { ImageResponse } from "next/og";

import { BRAND_COLORS, MARK } from "@/lib/brand";

// The home-screen icon (iOS and iPadOS round its corners): the mark in ivory
// and gold on charcoal, like the instrument at night.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const mark = MARK.regular;
  const { paper, ink, accent } = BRAND_COLORS.dark;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          // A faint warmth at the centre, as around the instrument's core.
          background: `radial-gradient(circle at 50% 46%, #1f1a12 0%, ${paper} 70%)`,
        }}
      >
        {/* Nudged right: the bead gives the left side more weight. */}
        <svg viewBox="0 0 32 32" width="116" height="116" style={{ marginLeft: 7 }}>
          <path d={mark.ring} fill="none" stroke={ink} strokeWidth={mark.ringWidth} strokeLinecap="round" />
          <circle cx={mark.bead.x} cy={mark.bead.y} r={mark.bead.r} fill={accent} />
          <circle cx="16" cy="16" r={mark.core} fill={ink} />
        </svg>
      </div>
    ),
    size,
  );
}
