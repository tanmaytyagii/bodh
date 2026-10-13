import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif, Literata, Tiro_Devanagari_Sanskrit } from "next/font/google";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { BRAND, DEFAULT_TITLE } from "@/lib/brand";
import { SITE_URL } from "@/lib/config";
import { THEME_COLORS } from "@/lib/theme";

import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });

// Literata covers IAST transliteration (ā ī ū ṛ ṃ ḥ ṇ ṣ ś ṭ ḍ ṅ ñ) in latin-ext.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
});

// Display serif for headlines and pull quotes only (one weight, small).
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

// Designed for Sanskrit: full conjunct coverage and Vedic punctuation.
const tiro = Tiro_Devanagari_Sanskrit({
  variable: "--font-tiro",
  weight: "400",
  subsets: ["devanagari"],
  display: "swap",
});

// The icons and the link preview image come from the files beside this one
// (icon.tsx, apple-icon.tsx, opengraph-image.tsx). Link previews take each
// page's own title and description: openGraph here sets neither, so Next.js
// fills them in from the page, and the Twitter card follows openGraph.
export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: { default: DEFAULT_TITLE, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  // The name under the icon on a home screen. Not `capable`: the site keeps the
  // browser around it, and its back button, which Ask relies on.
  appleWebApp: { title: BRAND.name, capable: false },
  openGraph: { siteName: BRAND.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // Draw under notches and home indicators; layouts pad with the safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme on <html> before React hydrates.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${literata.variable} ${instrument.variable} ${tiro.variable} antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeSync />
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-ink shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="relative flex-1 scroll-mt-20 pt-[calc(4rem+env(safe-area-inset-top))]">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
