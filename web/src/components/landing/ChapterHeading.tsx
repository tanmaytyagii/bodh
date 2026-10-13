import type { ReactNode } from "react";

/**
 * The opening of a chapter in the landing story: its number and name, a
 * display headline, and an optional lede. The rule beside the number draws
 * itself in as the chapter arrives. `devanagari` follows the name with the
 * same word in Devanagari.
 */
export function ChapterHeading({
  number,
  label,
  devanagari,
  id,
  title,
  children,
  align = "start",
  size = "lg",
}: {
  number: number;
  label: string;
  devanagari?: string | null;
  id: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
  /** "md" for a heading that shares a sticky column with other content. */
  size?: "lg" | "md";
}) {
  const centered = align === "center";
  return (
    <header className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className={`eyebrow flex items-center gap-3 text-accent ${centered ? "justify-center" : ""}`}>
        <span className="font-serif text-[0.8125rem] tracking-normal tabular-nums">{String(number).padStart(2, "0")}</span>
        <span aria-hidden className="reveal-rule h-px w-10 bg-accent/70" />
        {label}
        {devanagari && (
          <>
            <span aria-hidden className="-mx-1">
              ·
            </span>
            {/* Letter-spacing would break the headstroke that joins the letters. */}
            <span lang="hi" className="font-deva text-[0.9375rem] leading-none font-normal tracking-normal">
              {devanagari}
            </span>
          </>
        )}
      </p>
      <h2
        id={id}
        className={`reveal display mt-6 leading-[1] text-balance text-ink ${
          size === "md" ? "text-[clamp(2.25rem,3.6vw,3.25rem)]" : "text-[clamp(2.5rem,5.4vw,4.75rem)]"
        }`}
      >
        {title}
      </h2>
      {children && (
        <div className="reveal mt-6 text-[1.0625rem] leading-relaxed text-pretty text-ink-soft sm:text-lg">{children}</div>
      )}
    </header>
  );
}
