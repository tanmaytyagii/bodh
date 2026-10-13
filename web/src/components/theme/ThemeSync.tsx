"use client";

import { useEffect, useLayoutEffect } from "react";

import { applyTheme, subscribe } from "@/lib/theme";

/**
 * Keeps the theme applied for the whole visit: re-applies it after hydration
 * (React's development remount resets <html> attributes), follows the device
 * while "System" is selected, and picks up a choice made in another tab.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme();
  }, []);
  useEffect(() => subscribe(() => applyTheme()), []);
  return null;
}
