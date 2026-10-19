"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_LOCALE, getLocale, subscribeLocale, type Locale } from "./locale";
import { messageText, type MessageKey } from "./messages";

/** The interface language. English while rendering on the server and hydrating. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE);
}

/**
 * Interface text as a string, for attributes (placeholders, aria-labels) and
 * live announcements, which cannot carry both languages the way T does.
 */
export function useT(): (key: MessageKey, values?: Record<string, string | number>) => string {
  const locale = useLocale();
  return useCallback((key, values) => messageText(locale, key, values), [locale]);
}
