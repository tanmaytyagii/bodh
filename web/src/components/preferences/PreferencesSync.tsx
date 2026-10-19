"use client";

import { useEffect, useLayoutEffect } from "react";

import { applyLocale, subscribeLocale } from "@/lib/i18n/locale";
import { applyReading, subscribeReading } from "@/lib/reading";

/**
 * Keeps the language and reading preferences applied for the whole visit:
 * re-applies them after hydration (React's development remount resets <html>
 * attributes) and picks up a choice made in another tab.
 */
export function PreferencesSync() {
  useLayoutEffect(() => {
    applyLocale();
    applyReading();
  }, []);
  useEffect(() => {
    const offLocale = subscribeLocale(() => undefined);
    const offReading = subscribeReading(() => undefined);
    return () => {
      offLocale();
      offReading();
    };
  }, []);
  return null;
}
