// The product's name and identity live in lib/brand.ts.

// Where the FastAPI service lives, as seen from the Next.js server.
export const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

// The public address of the site, for absolute links in link previews
// (NEXT_PUBLIC_SITE_URL, compiled in at build time). Without it, Next.js
// falls back to localhost.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || null;
