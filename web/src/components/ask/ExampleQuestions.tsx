"use client";

import { Icon } from "@/components/Icon";

export const EXAMPLE_QUESTIONS = [
  "What should I do when I feel left behind?",
  "How do I handle uncertainty about my future?",
  "How can I act without being controlled by fear?",
  "How do I respond when anger clouds my judgment?",
];

/**
 * Starting points, kept quiet beside the question box: each fills it. Nothing
 * is sent until you send it. Sized in em, with the copy around them; two
 * columns once the copy column has room (a container query).
 */
export function ExampleQuestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div>
      <p id="examples-title" className="eyebrow text-ink-muted">
        Or begin with
      </p>
      <ul aria-labelledby="examples-title" className="mt-2.5 grid grid-cols-1 gap-x-8 @lg:grid-cols-2">
        {EXAMPLE_QUESTIONS.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => onPick(text)}
              className="group flex w-full items-start gap-2 py-1.5 text-left text-[0.9375em] leading-snug text-ink-soft transition-colors hover:text-ink"
            >
              <Icon
                name="arrowUpRight"
                className="mt-0.5 size-4 text-ink-muted transition-colors group-hover:text-accent"
              />
              <span className="decoration-rule-strong underline-offset-[3px] group-hover:underline">{text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
