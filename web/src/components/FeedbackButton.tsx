"use client";

import { useId, useRef, useState } from "react";

import type { MessageKey } from "@/lib/i18n/messages";
import { passageLabel } from "@/lib/passages";
import type { FeedbackKind } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

import { T } from "./i18n/T";
import { Icon } from "./Icon";

const KINDS: { value: FeedbackKind; label: MessageKey }[] = [
  { value: "incorrect_citation", label: "feedback.kind.incorrect_citation" },
  { value: "irrelevant_passage", label: "feedback.kind.irrelevant_passage" },
  { value: "inaccurate_interpretation", label: "feedback.kind.inaccurate_interpretation" },
  { value: "unhelpful_advice", label: "feedback.kind.unhelpful_advice" },
  { value: "safety_concern", label: "feedback.kind.safety_concern" },
  { value: "helpful", label: "feedback.kind.helpful" },
  { value: "other", label: "feedback.kind.other" },
];

export function FeedbackButton({
  passageId,
  answerId,
  question,
  label = "feedback.report",
  variant = "secondary",
}: {
  passageId?: string;
  answerId?: string;
  question?: string;
  label?: MessageKey;
  variant?: "secondary" | "toolbar" | "link";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setState("sending");
    const includeQuestion = data.get("include_question") === "on";
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: data.get("kind"),
          comment: String(data.get("comment") ?? "").slice(0, 2000) || null,
          passage_id: passageId ?? null,
          answer_id: answerId ?? null,
          include_question: includeQuestion,
          question: includeQuestion ? question : null,
        }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  const trigger =
    variant === "link"
      ? "inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
      : variant === "toolbar"
        ? buttonClass("ghost", "sm")
        : buttonClass("secondary", "sm");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setState("idle");
          dialog.current?.showModal();
        }}
        className={trigger}
      >
        {variant !== "link" && <Icon name="flag" className="size-4" />}
        <T k={label} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${formId}-title`}
        className="m-auto w-[min(94vw,32rem)] rounded-2xl border border-rule bg-surface-raised p-0 text-ink shadow-overlay backdrop:bg-black/50"
      >
        {state === "sent" ? (
          <div className="p-6">
            <span className="flex size-10 items-center justify-center rounded-full bg-ok-bg text-ok">
              <Icon name="check" className="size-5" />
            </span>
            <h2 id={`${formId}-title`} className="mt-4 font-serif text-xl font-semibold">
              <T k="feedback.thanks" />
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              <T k="feedback.thanks.detail" />
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("primary", "md")}>
                <T k="common.close" />
              </button>
            </div>
          </div>
        ) : (
          <form
            method="dialog"
            className="p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(event.currentTarget);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={`${formId}-title`} className="font-serif text-xl font-semibold">
                {passageId ? <T k="feedback.reportWith" values={{ ref: passageLabel(passageId) }} /> : <T k="feedback.report" />}
              </h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
              >
                <Icon name="close" className="size-5" />
                <span className="sr-only">
                  <T k="common.close" />
                </span>
              </button>
            </div>
            <fieldset className="mt-4 space-y-1.5">
              <legend className="sr-only">
                <T k="feedback.kinds" />
              </legend>
              {KINDS.map((kind, i) => (
                <label
                  key={kind.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule px-3 py-2.5 text-sm transition-colors hover:border-rule-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={kind.value}
                    defaultChecked={i === 0}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                  <span>
                    <T k={kind.label} />
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-ink-soft">
                <T k="feedback.details" />
              </span>
              <textarea
                name="comment"
                maxLength={2000}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-field bg-surface p-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </label>
            {question && (
              <label className="mt-3 flex items-start gap-2.5 text-sm text-ink-soft">
                <input type="checkbox" name="include_question" className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>
                  <T k="feedback.includeQuestion" />
                </span>
              </label>
            )}
            {state === "error" && (
              <p role="alert" className="mt-3 text-sm text-danger">
                <T k="feedback.error" />
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("ghost", "md")}>
                <T k="feedback.cancel" />
              </button>
              <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "md")}>
                {state === "sending" ? <T k="feedback.sending" /> : <T k="feedback.send" />}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
