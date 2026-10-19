// The interface language: English (the default) or Hindi.
//
// Every label is in the page in both languages (see T), and the one not
// chosen is hidden by globals.css. The choice is stored only in this browser,
// like the appearance; an inline script in <head> (LOCALE_INIT_SCRIPT) puts it
// on <html> before the first paint, so there is no flash of the other
// language, and switching never reloads the page or loses what you typed.
// Scripture, translations and editorial content are never translated here.

export type Locale = "en" | "hi";

export const LOCALES: Locale[] = ["en", "hi"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "sw.locale";

/** Runs synchronously in <head>; must not depend on anything else on the page. */
export const LOCALE_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  LOCALE_STORAGE_KEY,
)})==="hi")document.documentElement.setAttribute("data-locale","hi")}catch(e){}})()`;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "hi";
}

// Without storage access the choice still holds for the rest of the visit.
let memoryLocale: Locale | null = null;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // fall through
  }
  return memoryLocale ?? DEFAULT_LOCALE;
}

/** Puts the language on <html>, where the stylesheet chooses which labels to show. */
export function applyLocale(locale: Locale = getLocale()): void {
  const root = document.documentElement;
  if (locale === "hi") root.setAttribute("data-locale", "hi");
  else root.removeAttribute("data-locale");
}

export function setLocale(locale: Locale): void {
  memoryLocale = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // keep the in-memory choice
  }
  applyLocale(locale);
  listeners.forEach((listener) => listener());
}

/** Notifies on a new choice here or in another tab. */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      applyLocale();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
