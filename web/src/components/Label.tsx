import type { ReactNode } from "react";

import type { MessageKey } from "@/lib/i18n/messages";

import { T } from "./i18n/T";
import { SourceSeal } from "./Icon";

// Every block of content says what it is. These four kinds are styled
// differently everywhere in the app and must never be blurred together. Each
// has its own colour and marker shape, so the difference never rests on colour.
// Source text carries the verified-source seal.
export type ContentKind = "source" | "note" | "editorial" | "ai";

const STYLES: Record<ContentKind, { text: string; marker: string }> = {
  source: { text: "text-source", marker: "" },
  note: { text: "text-source", marker: "h-[2px] w-3 rounded-full" },
  editorial: { text: "text-editorial", marker: "size-[6px] rotate-45 rounded-[1px]" },
  ai: { text: "text-ai", marker: "size-[7px] rounded-full" },
};

const TEXT: Record<ContentKind, MessageKey> = {
  source: "label.source",
  note: "label.note",
  editorial: "label.editorial",
  ai: "label.ai",
};

export function Label({ kind, children }: { kind: ContentKind; children?: ReactNode }) {
  const style = STYLES[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-[0.6875rem] leading-none font-semibold tracking-[0.12em] whitespace-nowrap uppercase ${style.text}`}
    >
      {kind === "source" ? (
        <SourceSeal className="size-3.5 text-gold" />
      ) : (
        <span aria-hidden className={`inline-block bg-current ${style.marker}`} />
      )}
      <span>{children ?? <T k={TEXT[kind]} />}</span>
    </span>
  );
}
