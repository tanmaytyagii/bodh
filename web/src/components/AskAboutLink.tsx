"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { announceAskPrefill, askHref, type AskPrefill } from "@/lib/askPrefill";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";

/**
 * "Ask about this": opens the Ask page with a question filled in (in the
 * interface's language) and the passages it is about. Nothing is sent until
 * the question is sent.
 */
export function AskAboutLink({
  question,
  values,
  about,
  passageIds,
  className,
  children,
}: {
  /** The question to fill in, completed by the person. */
  question: MessageKey;
  values?: Record<string, string>;
  about: string;
  passageIds: string[];
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  const prefill: AskPrefill = { question: t(question, values), about, passageIds };
  return (
    <Link href={askHref(prefill)} onNavigate={(event) => announceAskPrefill(event, prefill)} className={className}>
      {children}
    </Link>
  );
}
