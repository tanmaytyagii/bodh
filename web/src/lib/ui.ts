// Shared class recipes, so controls look and behave the same everywhere.

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Ink in light mode, ivory in dark: the one strong action on a screen.
  primary: "bg-primary text-primary-ink shadow-card hover:bg-primary-hover disabled:hover:bg-primary",
  accent: "bg-accent text-accent-ink shadow-card hover:bg-accent-strong",
  secondary: "border border-rule-strong text-ink hover:border-field hover:bg-surface-raised",
  ghost: "text-ink-soft hover:bg-surface-sunk hover:text-ink",
  danger: "border border-danger/35 text-danger hover:border-danger/60 hover:bg-danger-bg",
  // The confirming step of a destructive action.
  destructive: "bg-danger text-paper shadow-card hover:opacity-90",
};

// Heights of 36–48px keep touch targets comfortable.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[0.8125rem]",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[0.9375rem]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = ""): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${extra}`.trim();
}

/** Inline text links inside prose. */
export const textLink =
  "underline decoration-rule-strong decoration-1 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-accent";

/** Small heading for groups inside side columns and footers. */
export const panelHeading = "text-[0.8125rem] font-semibold text-ink";

/** Uppercase utility label. */
export const utilityLabel = "eyebrow text-ink-muted";
