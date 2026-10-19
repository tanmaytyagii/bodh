"use client";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { buttonClass } from "@/lib/ui";

/** Back to the question box at the top of the page, ready to type. */
export function ReturnToQuestion() {
  return (
    <button
      type="button"
      className={buttonClass("primary", "lg")}
      onClick={() => {
        const input = document.getElementById("question");
        if (!(input instanceof HTMLTextAreaElement)) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        input.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        input.focus({ preventScroll: true });
      }}
    >
      <T k="landing.ask" />
      <Icon name="arrowRight" className="size-4" />
    </button>
  );
}
