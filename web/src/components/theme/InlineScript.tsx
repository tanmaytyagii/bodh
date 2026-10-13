"use client";

/**
 * A script that runs while the server HTML is parsed, before the first paint.
 * On the client it renders as inert `text/plain`, which keeps React from
 * warning about script tags; suppressHydrationWarning accepts the difference.
 * (Next.js guide: preventing flash before hydration.)
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
