"use client";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";

const EXAMPLES: MessageKey[] = ["example.leftBehind", "example.uncertainty", "example.fear", "example.anger"];

/**
 * Starting points, kept quiet beside the question box: each one puts its
 * question in the box (marked "+", and shown as chosen while the box holds
 * it). Nothing is sent until you send it. In the language of the interface;
 * sized in em, with the copy around them; two columns once the copy column
 * has room (a container query).
 */
export function ExampleQuestions({ value, onPick }: { value: string; onPick: (text: string) => void }) {
  const t = useT();
  return (
    <div>
      <p id="examples-title" className="eyebrow text-ink-muted">
        <T k="examples.title" />
      </p>
      <p id="examples-hint" className="sr-only">
        <T k="examples.hint" />
      </p>
      <ul aria-labelledby="examples-title" aria-describedby="examples-hint" className="mt-2.5 grid grid-cols-1 gap-x-8 @lg:grid-cols-2">
        {EXAMPLES.map((key) => {
          const text = t(key);
          const chosen = value.trim() === text;
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => onPick(text)}
                className="group flex w-full items-start gap-2 py-1.5 text-left text-[0.9375em] leading-snug text-ink-soft transition-colors hover:text-ink aria-pressed:text-ink"
              >
                <Icon
                  name={chosen ? "check" : "plus"}
                  className={`mt-0.5 size-4 transition-colors ${chosen ? "text-accent" : "text-ink-muted group-hover:text-accent"}`}
                />
                <span className="decoration-rule-strong underline-offset-[3px] group-hover:underline">
                  <T k={key} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
