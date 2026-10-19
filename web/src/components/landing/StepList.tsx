"use client";

import { useEffect, useState } from "react";

import { T } from "@/components/i18n/T";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";
import { journey } from "@/lib/journey";

/**
 * The steps of the understanding chapter, beside them as they are read: the
 * step crossing the middle of the screen is marked, and the instrument's
 * bead moves on with it.
 */
export function StepList({ steps }: { steps: { id: string; title: MessageKey }[] }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const ids = steps.map((step) => step.id).join(" ");

  useEffect(() => {
    const elements = ids.split(" ").map((id) => document.getElementById(id));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = elements.indexOf(entry.target as HTMLElement);
          if (index < 0) continue;
          setActive(index);
          journey.setStep(index);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const element of elements) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav aria-label={t("landing.steps")} className="mt-12 hidden lg:block">
      <ol className="relative space-y-1 border-l border-rule-strong">
        {steps.map((step, i) => {
          const current = i === active;
          return (
            <li key={step.id}>
              <a
                href={`#${step.id}`}
                aria-current={current ? "step" : undefined}
                className={`relative -ml-px flex items-baseline gap-4 border-l-2 py-2.5 pl-5 text-[0.9375rem] transition-colors duration-300 ${
                  current ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <span className="w-4 font-serif text-sm text-accent tabular-nums">{i + 1}</span>
                <span className={current ? "font-medium" : ""}>
                  <T k={step.title} />
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
