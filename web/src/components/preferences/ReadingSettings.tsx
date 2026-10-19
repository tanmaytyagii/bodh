"use client";

import { useId, useSyncExternalStore } from "react";

import { T } from "@/components/i18n/T";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getReadingSnapshot,
  parseReadingSnapshot,
  resetReading,
  setReading,
  subscribeReading,
  TEXT_SIZES,
  type TextSize,
} from "@/lib/reading";
import { buttonClass } from "@/lib/ui";

const SIZE_LABEL: Record<TextSize, MessageKey> = {
  md: "prefs.textSize.md",
  lg: "prefs.textSize.lg",
  xl: "prefs.textSize.xl",
};
// The sample letter grows with the size it stands for.
const SIZE_SAMPLE: Record<TextSize, string> = { md: "text-[0.875rem]", lg: "text-[1.0625rem]", xl: "text-[1.25rem]" };

/**
 * Text size, and whether passages show their Sanskrit and transliteration.
 * Native radios and switches; "Restore defaults" brings back the standard size
 * with everything shown.
 */
export function ReadingSettings({ showNote = false }: { showNote?: boolean }) {
  const snapshot = useSyncExternalStore(subscribeReading, getReadingSnapshot, () => null);
  const preferences = parseReadingSnapshot(snapshot);
  const name = useId();
  const isDefault = preferences.size === "md" && preferences.sanskrit && preferences.transliteration;

  return (
    <div>
      <fieldset>
        <legend className="text-[0.8125rem] font-semibold text-ink">
          <T k="prefs.textSize" />
        </legend>
        <div className="mt-2.5 inline-grid w-full max-w-xs grid-cols-3 gap-1 rounded-full bg-surface-sunk p-1 ring-1 ring-rule">
          {TEXT_SIZES.map((size) => (
            <label
              key={size}
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-ink-muted transition-[background-color,color,box-shadow] hover:text-ink has-[:checked]:bg-surface-raised has-[:checked]:text-ink has-[:checked]:shadow-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
            >
              <input
                type="radio"
                name={name}
                value={size}
                checked={preferences.size === size}
                onChange={() => setReading({ size })}
                className="sr-only"
              />
              <span aria-hidden className={`font-serif leading-none ${SIZE_SAMPLE[size]}`}>
                A
              </span>
              <span className="text-[0.75rem] font-medium">
                <T k={SIZE_LABEL[size]} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[0.8125rem] font-semibold text-ink">
          <T k="prefs.show" />
        </legend>
        <div className="mt-1.5 divide-y divide-rule">
          <Switch
            label="prefs.sanskrit"
            checked={preferences.sanskrit}
            onChange={(sanskrit) => setReading({ sanskrit })}
          />
          <Switch
            label="prefs.transliteration"
            checked={preferences.transliteration}
            onChange={(transliteration) => setReading({ transliteration })}
          />
        </div>
      </fieldset>

      {showNote && (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          <T k="prefs.reading.note" />
        </p>
      )}
      <button
        type="button"
        onClick={resetReading}
        disabled={isDefault}
        className={buttonClass("ghost", "sm", "mt-3 -ml-3.5")}
      >
        <T k="prefs.reset" />
      </button>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: MessageKey;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5 text-[0.9375rem] text-ink">
      <span>
        <T k={label} />
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-10 shrink-0 rounded-full bg-rule-strong transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-paper after:shadow-card after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}
