import { NextResponse, type NextRequest } from "next/server";

import { API_URL } from "@/lib/config";
import type { Concept, Source, Story } from "@/lib/types";

// Record pages stream from a prerendered shell, so by the time a page
// discovers that its verse, theme or story does not exist, a 200 status has
// already been sent. Checking the path here first gives unknown records a real
// 404. The indexes are cached for a while; if the API cannot be reached the
// request continues and the page reports the problem itself.

const TTL_MS = 10 * 60 * 1000;

interface Index {
  sources: Map<string, Map<string, number>>;
  concepts: Set<string>;
  stories: Set<string>;
}

let cached: { at: number; index: Index } | null = null;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function loadIndex(): Promise<Index | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;
  try {
    const [sources, concepts, stories] = await Promise.all([
      getJson<Source[]>("/sources"),
      getJson<Concept[]>("/concepts"),
      getJson<Story[]>("/stories"),
    ]);
    const index: Index = {
      sources: new Map(
        sources.map((s) => [s.id, new Map(s.divisions.map((d) => [String(d.number), d.passage_count]))]),
      ),
      concepts: new Set(concepts.map((c) => c.id)),
      stories: new Set(stories.map((s) => s.id)),
    };
    cached = { at: Date.now(), index };
    return index;
  } catch {
    return null;
  }
}

function scriptureExists(index: Index, parts: string[]): boolean {
  const [source, chapter, verse] = parts;
  const chapters = index.sources.get(source);
  if (!chapters) return false;
  if (chapter === undefined) return true;
  const count = chapters.get(chapter);
  if (count === undefined) return false;
  if (verse === undefined) return true;
  return /^\d+$/.test(verse) && Number(verse) >= 1 && Number(verse) <= count;
}

export async function proxy(request: NextRequest) {
  const [section, ...rest] = request.nextUrl.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const index = await loadIndex();
  if (!index) return NextResponse.next();
  let exists = true;
  if (section === "scripture") exists = rest.length >= 1 && rest.length <= 3 && scriptureExists(index, rest);
  else if (section === "concepts") exists = rest.length === 1 && index.concepts.has(rest[0]);
  else if (section === "stories") exists = rest.length === 1 && index.stories.has(rest[0]);
  return exists ? NextResponse.next() : NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

export const config = {
  matcher: ["/scripture/:path+", "/concepts/:id", "/stories/:id"],
};
