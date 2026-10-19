"use client";

import { T } from "@/components/i18n/T";
import { Icon, type IconName } from "@/components/Icon";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";

const OPTIONS: { value: ThemePreference; label: MessageKey; icon: IconName }[] = [
  { value: "system", label: "theme.system", icon: "monitor" },
  { value: "light", label: "theme.light", icon: "sun" },
  { value: "dark", label: "theme.dark", icon: "moon" },
];

/**
 * Appearance choice as a segmented control. Native radio inputs, so arrow
 * keys and screen readers work as expected.
 */
export function ThemeSelector() {
  const { preference, resolved, setPreference } = useTheme();

  const status = !resolved ? null : preference === "system" ? (
    <T k={resolved === "dark" ? "theme.status.systemDark" : "theme.status.systemLight"} />
  ) : (
    <T k={preference === "dark" ? "theme.status.dark" : "theme.status.light"} />
  );

  return (
    <fieldset>
      <legend className="sr-only">
        <T k="theme.label" />
      </legend>
      <div className="inline-grid w-full max-w-md grid-cols-3 gap-1 rounded-full bg-surface-sunk p-1 ring-1 ring-rule sm:w-auto">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-ink-muted transition-[background-color,color,box-shadow] hover:text-ink has-[:checked]:bg-surface-raised has-[:checked]:text-ink has-[:checked]:shadow-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]"
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
              className="sr-only"
            />
            <Icon name={option.icon} className="size-4" />
            <T k={option.label} />
          </label>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">
        {status}
      </p>
    </fieldset>
  );
}
