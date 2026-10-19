"use client";

import { useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/useLocale";
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
 * The send button with nothing to send yet: still the ink of the one strong
 * action, held back (no shadow, softer label), rather than greyed out as if
 * it were broken. It stays disabled until there is a question.
 */
const SUBMIT = buttonClass(
  "primary",
  "md",
  "disabled:bg-primary/75 disabled:text-primary-ink/75 disabled:opacity-100 disabled:shadow-none",
);

/**
 * The writing surface, for a first question and for follow-ups. Its text is
 * sized in em, so it keeps the size of the text around it: the invitation's
 * copy grows on large screens, and the question box with it. When a question
 * is about a passage, theme or story ("Ask about this"), that is shown above
 * the box and can be removed.
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
  about,
}: {
  variant: "initial" | "follow-up";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onStartOver?: () => void;
  pending: boolean;
  error: ReactNode | null;
  /** Send the same question again after an error. */
  onRetry?: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  about?: { label: string; onClear: () => void } | null;
}) {
  const initial = variant === "initial";
  const modifier = useModifierKey();
  const t = useT();
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
          <label htmlFor={initial ? "question" : "follow-up-question"} className="eyebrow text-ink-muted">
            <T k={initial ? "composer.label" : "composer.followUp.label"} />
          </label>
          {initial && (
            <span className="hidden items-center gap-1.5 text-[0.75em] text-ink-muted sm:inline-flex">
              <Icon name="globe" className="size-3.5" />
              English · <span lang="hi">हिन्दी</span> · Hinglish
            </span>
          )}
        </div>
        {about && (
          <div className="px-5 pt-3 sm:px-6">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-source-bg py-1 pr-1 pl-3 text-[0.8125em] text-ink ring-1 ring-source/25">
              <span className="truncate">
                <T k="composer.about" values={{ label: <span className="font-semibold text-source">{about.label}</span> }} />
              </span>
              <button
                type="button"
                onClick={about.onClear}
                aria-label={t("composer.about.remove", { label: about.label })}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
              >
                <Icon name="close" className="size-3.5" />
              </button>
            </span>
          </div>
        )}
        <textarea
          id={initial ? "question" : "follow-up-question"}
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
          placeholder={t(initial ? "composer.placeholder" : "composer.followUp.placeholder")}
          className={`block max-h-[50vh] w-full resize-none bg-transparent px-5 pt-3 pb-2 text-[1.0625em] leading-relaxed text-ink [field-sizing:content] placeholder:text-ink-muted focus:outline-none disabled:opacity-60 sm:px-6 sm:text-[1.125em] ${
            initial ? "min-h-24 sm:min-h-[clamp(5rem,14svh,10rem)]" : "min-h-20"
          }`}
          aria-describedby={initial ? "question-help" : "follow-up-help"}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-1 pb-4 sm:px-5">
          {/* Beside the buttons while it has 8rem, wrapping onto two lines, so a
              phone keeps the button in the first screen; otherwise above them. */}
          <p
            id={initial ? "question-help" : "follow-up-help"}
            className="flex min-w-0 grow basis-32 items-center gap-1.5 text-[0.75em] text-ink-muted"
          >
            <Icon name="lock" className="size-3.5" />
            <span>
              <T k="composer.private" />
              {remaining <= 300 && (
                <>
                  {" "}
                  <T k="composer.remaining" values={{ count: remaining }} />
                </>
              )}
              <span className="sr-only">
                {" "}
                <T k={modifier === "⌘" ? "composer.shortcut.mac" : "composer.shortcut"} />
              </span>
            </span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            {onStartOver && !pending && (
              <button type="button" onClick={onStartOver} className={buttonClass("ghost", "sm")}>
                <Icon name="rotateCcw" className="size-3.5" />
                <T k="composer.startOver" />
              </button>
            )}
            <span aria-hidden className="mr-1 hidden items-center gap-1 text-[0.75em] text-ink-muted sm:flex">
              <kbd>{modifier}</kbd>
              <kbd>Enter</kbd>
            </span>
            {pending ? (
              <button type="button" onClick={onStop} className={buttonClass("secondary", "md")}>
                <Icon name="stop" className="size-4" />
                <T k="composer.stop" />
              </button>
            ) : (
              <button type="submit" disabled={!value.trim()} className={SUBMIT}>
                <T k={initial ? "composer.reflect" : "composer.continue"} />
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
              <T k="composer.tryAgain" />
            </button>
          )}
        </p>
      )}
    </form>
  );
}
