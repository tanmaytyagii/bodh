import type { ReactNode } from "react";

import { formatMessage, MESSAGES, type MessageKey, type MessageValues } from "@/lib/i18n/messages";

/**
 * An interface label in both languages; the stylesheet shows the one chosen
 * (lib/i18n/locale.ts). Server and browser render the same markup, so it
 * works in server components, never mismatches on hydration, and switching
 * language is instant. The language not shown is display: none, so it is
 * neither read aloud nor part of an accessible name.
 */
export function T({ k, values }: { k: MessageKey; values?: MessageValues }) {
  return (
    <>
      <span data-locale-text="en">{formatMessage(MESSAGES.en[k], values)}</span>
      <span data-locale-text="hi" lang="hi">
        {formatMessage(MESSAGES.hi[k], values)}
      </span>
    </>
  );
}

/**
 * The same piece of interface written for each language, where it carries
 * markup of its own (a headline with an accent, say). Shown like T.
 */
export function Both({ en, hi }: { en: ReactNode; hi: ReactNode }) {
  return (
    <>
      <span data-locale-text="en">{en}</span>
      <span data-locale-text="hi" lang="hi">
        {hi}
      </span>
    </>
  );
}
