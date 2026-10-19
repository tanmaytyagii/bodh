"use client";

import { useId } from "react";

import { T } from "@/components/i18n/T";
import { setLocale, type Locale } from "@/lib/i18n/locale";
import { useLocale } from "@/lib/i18n/useLocale";

// Each language is named in itself, whichever is chosen.
const OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

/**
 * English or Hindi, as a segmented control of native radio inputs (arrow
 * keys and screen readers work as expected). Switching keeps the page as it
 * is, including anything typed into it.
 */
export function LanguageSelector({ showNote = false }: { showNote?: boolean }) {
  const locale = useLocale();
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">
        <T k="prefs.language" />
      </legend>
      <div className="inline-grid w-full max-w-xs grid-cols-2 gap-1 rounded-full bg-surface-sunk p-1 ring-1 ring-rule">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex h-10 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-medium text-ink-muted transition-[background-color,color,box-shadow] hover:text-ink has-[:checked]:bg-surface-raised has-[:checked]:text-ink has-[:checked]:shadow-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={locale === option.value}
              onChange={() => setLocale(option.value)}
              className="sr-only"
            />
            <span lang={option.value}>{option.label}</span>
          </label>
        ))}
      </div>
      {showNote && (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          <T k="prefs.language.note" />
        </p>
      )}
    </fieldset>
  );
}
