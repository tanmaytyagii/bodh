"use client";

import { useId, useRef, type ReactNode } from "react";

import { buttonClass } from "@/lib/ui";

/**
 * A button for a destructive action that asks first, in a modal dialog.
 * Focus starts on Cancel; Escape cancels.
 */
export function ConfirmButton({
  children,
  className,
  disabled,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" disabled={disabled} className={className} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="m-auto w-[min(92vw,27rem)] rounded-[1.5rem] bg-surface-raised p-6 text-ink shadow-overlay ring-1 ring-rule backdrop:bg-black/50 sm:p-7"
      >
        <h2 id={`${id}-title`} className="display text-[1.875rem] leading-tight">
          {title}
        </h2>
        <p id={`${id}-description`} className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {description}
        </p>
        <div className="mt-7 flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("ghost", "md")}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              onConfirm();
            }}
            className={buttonClass("destructive", "md")}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
