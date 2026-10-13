"use client";

import { useSyncExternalStore, type RefObject } from "react";

import { Icon } from "@/components/Icon";
import { buttonClass } from "@/lib/ui";

export const MAX_QUESTION_CHARS = 4000;

const noSubscribe = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere (and while rendering on the server). */
function useModifierKey(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/**
 * The writing surface, for a first question and for follow-ups. Its text is
 * sized in em, so it keeps the size of the text around it: the invitation's
 * copy grows on large screens, and the question box with it.
 */
export function QuestionComposer({
  variant,
  value,
  onChange,
  onSubmit,
  onStop,
  onStartOver,
  pending,
  error,
  onRetry,
  inputRef,
}: {
  variant: "initial" | "follow-up";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onStartOver?: () => void;
  pending: boolean;
  error: string | null;
  /** Send the same question again after an error. */
  onRetry?: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const initial = variant === "initial";
  const modifier = useModifierKey();
  const remaining = MAX_QUESTION_CHARS - value.length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="rounded-[1.5rem] bg-surface-raised/92 shadow-raised ring-1 ring-field backdrop-blur-md transition-[box-shadow] duration-200 focus-within:ring-2 focus-within:ring-accent">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <label htmlFor="question" className="eyebrow text-ink-muted">
            {initial ? "Describe your situation" : "Ask a follow-up, challenge an interpretation, or add detail"}
          </label>
          {initial && (
            <span className="hidden items-center gap-1.5 text-[0.75em] text-ink-muted sm:inline-flex">
              <Icon name="globe" className="size-3.5" />
              English · <span lang="hi">हिन्दी</span> · Hinglish
            </span>
          )}
        </div>
        <textarea
          id="question"
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_QUESTION_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={initial ? 4 : 2}
          maxLength={MAX_QUESTION_CHARS}
          placeholder={
            initial
              ? "What is on your mind? A decision you are weighing, a relationship, your work…"
              : "For example: what does “inaction” mean in that verse?"
          }
          className={`block max-h-[50vh] w-full resize-none bg-transparent px-5 pt-3 pb-2 text-[1.0625em] leading-relaxed text-ink [field-sizing:content] placeholder:text-ink-muted focus:outline-none disabled:opacity-60 sm:px-6 sm:text-[1.125em] ${
            initial ? "min-h-24 sm:min-h-[clamp(5rem,14svh,10rem)]" : "min-h-20"
          }`}
          aria-describedby="question-help"
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-1 pb-4 sm:px-5">
          {/* Beside the buttons while it has 8rem, wrapping onto two lines, so a
              phone keeps the button in the first screen; otherwise above them. */}
          <p id="question-help" className="flex min-w-0 grow basis-32 items-center gap-1.5 text-[0.75em] text-ink-muted">
            <Icon name="lock" className="size-3.5" />
            <span>
              Private — not stored on our server.
              {remaining <= 300 && ` ${remaining} characters left.`}
              <span className="sr-only"> Press {modifier === "⌘" ? "Command" : "Control"} and Enter to send.</span>
            </span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            {onStartOver && !pending && (
              <button type="button" onClick={onStartOver} className={buttonClass("ghost", "sm")}>
                <Icon name="rotateCcw" className="size-3.5" />
                Start over
              </button>
            )}
            <span aria-hidden className="mr-1 hidden items-center gap-1 text-[0.75em] text-ink-muted sm:flex">
              <kbd>{modifier}</kbd>
              <kbd>Enter</kbd>
            </span>
            {pending ? (
              <button type="button" onClick={onStop} className={buttonClass("secondary", "md")}>
                <Icon name="stop" className="size-4" />
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!value.trim()} className={buttonClass("primary", "md")}>
                {initial ? "Reflect" : "Continue"}
                <Icon name="arrowRight" className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger ring-1 ring-danger/25"
        >
          <Icon name="alert" className="mt-0.5 size-4" />
          <span className="min-w-0 flex-1">{error}</span>
          {onRetry && value.trim() && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              Try again
            </button>
          )}
        </p>
      )}
    </form>
  );
}
