"use client";

import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/Icon";
import type { Stage } from "@/lib/types";

const STAGES: { key: Stage; label: string }[] = [
  { key: "understanding", label: "Understanding your situation" },
  { key: "retrieving", label: "Searching the texts" },
  { key: "writing", label: "Writing a grounded reply" },
];

/** The three stages of a reply, laid out as a path. The stage under way is the mark, its bead travelling. */
export function Progress({ stage, passagesFound }: { stage: Stage | "sending"; passagesFound?: number }) {
  const current = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="grid gap-4 sm:grid-cols-3 sm:gap-0" aria-label="Progress">
      {STAGES.map((s, i) => {
        const done = current > i;
        const active = current === i || (stage === "sending" && i === 0);
        return (
          <li key={s.key} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3 sm:pr-6">
            {i < STAGES.length - 1 && (
              <span aria-hidden className="absolute top-3 right-0 left-9 hidden h-px bg-rule-strong sm:block" />
            )}
            {active ? (
              <span aria-hidden className="relative flex size-6 shrink-0">
                <BrandMark orbit className="size-6 text-ink" />
              </span>
            ) : (
              <span
                aria-hidden
                className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
                  done ? "bg-primary text-primary-ink" : "bg-paper text-ink-muted ring-1 ring-rule-strong"
                }`}
              >
                {done ? <Icon name="check" className="size-3.5" /> : i + 1}
              </span>
            )}
            <span className={`text-sm ${done || active ? "text-ink" : "text-ink-muted"}`}>
              {s.label}
              {s.key === "retrieving" && done && passagesFound ? (
                <span className="block text-ink-muted">{passagesFound} passages found</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
