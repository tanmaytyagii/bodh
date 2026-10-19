// Reading preferences: text size, and whether the Sanskrit and the
// transliteration are shown with each passage.
//
// Like the appearance and the language, they are kept only in this browser
// and put on <html> by an inline script before the first paint
// (READING_INIT_SCRIPT), so pages render with them from the start. They only
// change how text is shown (globals.css): nothing is removed from the page,
// and the text itself never changes.

export type TextSize = "md" | "lg" | "xl";

export interface ReadingPreferences {
  size: TextSize;
  sanskrit: boolean;
  transliteration: boolean;
}

export const TEXT_SIZES: TextSize[] = ["md", "lg", "xl"];
export const DEFAULT_READING: ReadingPreferences = { size: "md", sanskrit: true, transliteration: true };
export const READING_STORAGE_KEY = "sw.reading.v1";

/** Runs synchronously in <head>; must not depend on anything else on the page. */
export const READING_INIT_SCRIPT = `(function(){try{var r=JSON.parse(localStorage.getItem(${JSON.stringify(
  READING_STORAGE_KEY,
)})||"{}"),d=document.documentElement;if(r.size==="lg"||r.size==="xl")d.setAttribute("data-text-size",r.size);if(r.sanskrit===false)d.setAttribute("data-hide-sanskrit","");if(r.transliteration===false)d.setAttribute("data-hide-transliteration","")}catch(e){}})()`;

function parse(raw: unknown): ReadingPreferences {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ReadingPreferences, unknown>>;
  return {
    size: TEXT_SIZES.includes(value.size as TextSize) ? (value.size as TextSize) : DEFAULT_READING.size,
    sanskrit: value.sanskrit !== false,
    transliteration: value.transliteration !== false,
  };
}

let memory: ReadingPreferences | null = null;
const listeners = new Set<() => void>();

export function getReading(): ReadingPreferences {
  try {
    const raw = window.localStorage.getItem(READING_STORAGE_KEY);
    if (raw) return parse(JSON.parse(raw));
  } catch {
    // fall through
  }
  return memory ?? DEFAULT_READING;
}

export function applyReading(preferences: ReadingPreferences = getReading()): void {
  const root = document.documentElement;
  if (preferences.size === "md") root.removeAttribute("data-text-size");
  else root.setAttribute("data-text-size", preferences.size);
  root.toggleAttribute("data-hide-sanskrit", !preferences.sanskrit);
  root.toggleAttribute("data-hide-transliteration", !preferences.transliteration);
}

export function setReading(change: Partial<ReadingPreferences>): void {
  const next = parse({ ...getReading(), ...change });
  memory = next;
  try {
    window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // keep the in-memory choice
  }
  applyReading(next);
  listeners.forEach((listener) => listener());
}

export function resetReading(): void {
  memory = null;
  try {
    window.localStorage.removeItem(READING_STORAGE_KEY);
  } catch {
    // ignore
  }
  applyReading(DEFAULT_READING);
  listeners.forEach((listener) => listener());
}

export function subscribeReading(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === READING_STORAGE_KEY || event.key === null) {
      applyReading();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A primitive snapshot for useSyncExternalStore: "size|sanskrit|transliteration". */
export function getReadingSnapshot(): string {
  const r = getReading();
  return `${r.size}|${r.sanskrit ? 1 : 0}|${r.transliteration ? 1 : 0}`;
}

export function parseReadingSnapshot(snapshot: string | null): ReadingPreferences {
  if (!snapshot) return DEFAULT_READING;
  const [size, sanskrit, transliteration] = snapshot.split("|");
  return parse({ size, sanskrit: sanskrit !== "0", transliteration: transliteration !== "0" });
}
