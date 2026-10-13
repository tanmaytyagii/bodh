// Appearance: System (follow the device), Light or Dark.
//
// The choice is stored only in this browser. An inline script in <head>
// (THEME_INIT_SCRIPT) applies it before the first paint, so there is no flash
// of the wrong theme; ThemeSync keeps it applied after hydration and follows
// the device while "System" is selected.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sw.theme";
export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Page background per theme, for the browser's toolbar colour. Matches globals.css. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#f8f6f1", dark: "#0f1012" };

/**
 * Runs synchronously in <head>. Must not depend on anything else on the page.
 * Without storage access it falls back to the device setting.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,p=null;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}if(p!=="light"&&p!=="dark"){p=window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light"}d.setAttribute("data-theme",p);d.style.colorScheme=p})()`;

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// If storage is unavailable (blocked cookies, some private modes), the choice
// still applies for the rest of the visit.
let memoryPreference: ThemePreference | null = null;
const listeners = new Set<() => void>();

export function getPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isPreference(stored)) return stored;
  } catch {
    // fall through
  }
  return memoryPreference ?? "system";
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/** Put the theme on <html> and in the browser toolbar colour. */
export function applyTheme(preference: ThemePreference = getPreference()): ResolvedTheme {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLORS[theme]);
  });
  return theme;
}

export function setPreference(preference: ThemePreference): void {
  memoryPreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // keep the in-memory choice
  }
  applyTheme(preference);
  listeners.forEach((listener) => listener());
}

/** Notifies on a new choice here, in another tab, or (for System) on the device. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  media.addEventListener("change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A primitive snapshot for useSyncExternalStore: "preference:resolved". */
export function getSnapshot(): string {
  const preference = getPreference();
  return `${preference}:${resolveTheme(preference)}`;
}

export function parseSnapshot(snapshot: string | null): { preference: ThemePreference; resolved: ResolvedTheme | null } {
  if (!snapshot) return { preference: "system", resolved: null };
  const [preference, resolved] = snapshot.split(":");
  return {
    preference: isPreference(preference) ? preference : "system",
    resolved: resolved === "dark" || resolved === "light" ? resolved : null,
  };
}
