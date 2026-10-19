"use client";

import { useEffect, useState, type RefObject } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Phones only: a compact "Ask a follow-up" at the foot of the screen while
 * you read an answer, so the next question is always a tap away. It steps
 * aside once the follow-up box is in view, while you type anywhere (the
 * keyboard is up), and at the very top of the answer; it sits above the
 * home indicator, and the page leaves room beneath the answer for it.
 */
export function FollowUpDock({ targetId, inputRef }: { targetId: string; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    let inView = false;
    let typing = isEditable(document.activeElement);
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(!inView && !typing && window.scrollY > 240);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        schedule();
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    observer.observe(target);
    const onFocusIn = (event: FocusEvent) => {
      typing = isEditable(event.target);
      schedule();
    };
    const onFocusOut = () => {
      typing = false;
      schedule();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", schedule, { passive: true });
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-[opacity,translate] duration-300 md:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
          inputRef.current?.focus({ preventScroll: true });
        }}
        className="mx-auto flex h-12 w-full max-w-md items-center justify-center gap-2 rounded-full bg-primary text-[0.9375rem] font-medium text-primary-ink shadow-overlay ring-1 ring-black/5 active:translate-y-px"
      >
        <Icon name="reply" className="size-4" />
        <T k="dock.followUp" />
      </button>
    </div>
  );
}
