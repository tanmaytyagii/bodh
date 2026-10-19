"use client";

import Link from "next/link";
import { useId } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/useLocale";

import { LanguageSelector } from "./LanguageSelector";
import { ReadingSettings } from "./ReadingSettings";

/**
 * Language and reading preferences, a click away on wide screens: a small
 * panel in the browser's top layer (the native popover, which closes on
 * Escape or a click outside). Small screens have the same controls in the
 * menu, and every screen in Settings.
 */
export function PreferencesMenu() {
  const id = useId();
  const t = useT();
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={t("prefs.open")}
        title={t("prefs.open")}
        className="flex size-9 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,box-shadow] duration-200 hover:bg-surface-sunk/80 hover:text-ink"
      >
        <Icon name="textSize" className="size-[1.125rem]" />
      </button>
      <div
        id={id}
        popover="auto"
        aria-label={t("prefs.title")}
        className="pointer-events-auto fixed inset-auto top-[calc(4rem+env(safe-area-inset-top))] right-[calc(var(--page-x)-0.5rem)] m-0 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border-0 bg-surface-raised p-6 text-ink shadow-overlay ring-1 ring-rule"
      >
        <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
          <Icon name="languages" className="size-4 text-ink-muted" />
          <T k="prefs.language" />
        </p>
        <div className="mt-2.5">
          <LanguageSelector />
        </div>
        <div className="mt-6 border-t border-rule pt-5">
          <ReadingSettings />
        </div>
        <Link
          href="/settings"
          className="mt-2 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <T k="prefs.allSettings" />
          <Icon name="arrowRight" className="size-3.5" />
        </Link>
      </div>
    </>
  );
}
