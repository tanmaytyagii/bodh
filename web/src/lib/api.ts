import "server-only";

import { cacheLife } from "next/cache";

import { API_URL } from "./config";
import type { Chapter, Concept, Health, PassageDetail, SearchResponse, Source, Story } from "./types";

// Server-side reads of the scripture corpus. The corpus only changes when it
// is re-ingested, so these are cached; callers read route params first, which
// keeps rendering at request time and the build independent of the API.
// A missing record resolves to null - pages call notFound() themselves, outside
// the cached scope.

export class ApiUnavailableError extends Error {}

// A corpus read takes milliseconds. One that stalls fails here, and the page
// offers to try again, instead of holding the reader for minutes.
const TIMEOUT_MS = 15_000;

async function get<T>(path: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiUnavailableError(`The scripture API did not answer ${path} within ${TIMEOUT_MS / 1000} s.`);
    }
    throw new ApiUnavailableError(
      `The scripture API at ${API_URL} is not reachable. Start it with \`uvicorn app.main:app\` in backend/.`,
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiUnavailableError(`The scripture API returned ${response.status} for ${path}.`);
  }
  return (await response.json()) as T;
}

export async function getSources(): Promise<Source[] | null> {
  "use cache";
  cacheLife("hours");
  return get<Source[]>("/sources");
}

export async function getSource(id: string): Promise<Source | null> {
  "use cache";
  cacheLife("hours");
  return get<Source>(`/sources/${encodeURIComponent(id)}`);
}

export async function getChapter(source: string, chapter: string): Promise<Chapter | null> {
  "use cache";
  cacheLife("hours");
  return get<Chapter>(
    `/sources/${encodeURIComponent(source)}/chapters/${encodeURIComponent(chapter)}`,
  );
}

export async function getPassage(id: string): Promise<PassageDetail | null> {
  "use cache";
  cacheLife("hours");
  return get<PassageDetail>(`/passages/${encodeURIComponent(id)}?context=2`);
}

export async function getPassageAt(source: string, chapter: string, verse: string): Promise<PassageDetail | null> {
  "use cache";
  cacheLife("hours");
  return get<PassageDetail>(
    `/sources/${encodeURIComponent(source)}/passages/${encodeURIComponent(chapter)}/${encodeURIComponent(verse)}?context=2`,
  );
}

export async function getStories(): Promise<Story[] | null> {
  "use cache";
  cacheLife("hours");
  return get<Story[]>("/stories");
}

export async function getStory(id: string): Promise<Story | null> {
  "use cache";
  cacheLife("hours");
  return get<Story>(`/stories/${encodeURIComponent(id)}`);
}

export async function getConcepts(): Promise<Concept[] | null> {
  "use cache";
  cacheLife("hours");
  return get<Concept[]>("/concepts");
}

export async function getConcept(id: string): Promise<Concept | null> {
  "use cache";
  cacheLife("hours");
  return get<Concept>(`/concepts/${encodeURIComponent(id)}`);
}

export async function search(query: string, limit = 12): Promise<SearchResponse | null> {
  "use cache";
  cacheLife("minutes");
  return get<SearchResponse>(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getHealth(): Promise<Health | null> {
  try {
    return await get<Health>("/health");
  } catch {
    return null;
  }
}
