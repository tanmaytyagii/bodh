"use client";

import { Icon, type IconName } from "@/components/Icon";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/**
 * Appearance choice as a segmented control. Native radio inputs, so arrow
 * keys and screen readers work as expected.
 */
export function ThemeSelector() {
  const { preference, resolved, setPreference } = useTheme();

  let status = "";
  if (resolved) {
    status =
      preference === "system"
        ? `Following your device, which is set to ${resolved}.`
        : `Always ${preference}, whatever your device is set to.`;
  }

  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
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
            {option.label}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-ink-muted">
        {status}
      </p>
    </fieldset>
  );
}
