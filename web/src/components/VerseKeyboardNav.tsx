"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { T } from "./i18n/T";

/** Elements that use the arrow keys themselves: fields, open dialogs, and composite widgets. */
const USES_ARROWS =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog[open], :popover-open, " +
  "[role=slider], [role=listbox], [role=menu], [role=menubar], [role=tablist], [role=radiogroup], " +
  "[role=tree], [role=grid], [role=combobox], [role=spinbutton]";

function usesArrows(target: Element): boolean {
  try {
    return target.closest(USES_ARROWS) !== null;
  } catch {
    // A browser that does not know :popover-open has no popovers to protect.
    return target.closest(USES_ARROWS.replace(":popover-open, ", "")) !== null;
  }
}

/**
 * On a verse's page, ← and → open the previous and next verse, as the links
 * beside it do. Never while typing, inside a widget that uses the arrows,
 * with a modifier held (so Alt+← stays the browser's Back), or once another
 * handler has taken the key; at the first or last verse there is nothing to
 * open. Screen readers in browse mode keep the arrows for themselves.
 */
export function VerseKeyboardNav({ previous, next }: { previous?: string; next?: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target instanceof Element && usesArrows(event.target)) return;
      const href = event.key === "ArrowLeft" ? previous : next;
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);

  if (!previous && !next) return null;
  return (
    <p className="mx-auto mt-4 hidden max-w-[52rem] items-center justify-center gap-1.5 text-xs text-ink-muted [@media(hover:hover)]:flex">
      <kbd aria-hidden>←</kbd>
      <kbd aria-hidden>→</kbd>
      <span>
        <T k="verse.keys" />
      </span>
    </p>
  );
}
