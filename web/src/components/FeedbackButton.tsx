"use client";

import { useId, useRef, useState } from "react";

import { passageLabel } from "@/lib/passages";
import type { FeedbackKind } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

import { Icon } from "./Icon";

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "incorrect_citation", label: "A citation or quotation is wrong" },
  { value: "irrelevant_passage", label: "A passage is not relevant" },
  { value: "inaccurate_interpretation", label: "An interpretation misrepresents the text" },
  { value: "unhelpful_advice", label: "The advice was not helpful" },
  { value: "safety_concern", label: "Something here could cause harm" },
  { value: "helpful", label: "This was helpful" },
  { value: "other", label: "Something else" },
];

export function FeedbackButton({
  passageId,
  answerId,
  question,
  label = "Report an issue",
  variant = "secondary",
}: {
  passageId?: string;
  answerId?: string;
  question?: string;
  label?: string;
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
        {label}
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
              Thank you
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              Your report was recorded and will be reviewed. Reports like this are how the
              citations and interpretations get better.
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("primary", "md")}>
                Close
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
                {passageId ? `Report an issue with ${passageLabel(passageId)}` : "Report an issue"}
              </h2>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
              >
                <Icon name="close" className="size-5" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <fieldset className="mt-4 space-y-1.5">
              <legend className="sr-only">What kind of issue?</legend>
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
                  {kind.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-ink-soft">Details (optional)</span>
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
                Include my question so reviewers can see the context. It is not stored otherwise.
              </label>
            )}
            {state === "error" && (
              <p role="alert" className="mt-3 text-sm text-danger">
                The report could not be sent. Please try again.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("ghost", "md")}>
                Cancel
              </button>
              <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "md")}>
                {state === "sending" ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
