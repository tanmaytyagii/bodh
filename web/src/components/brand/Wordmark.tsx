import { BRAND } from "@/lib/brand";

import { BrandMark } from "./BrandMark";

const SIZES = {
  // The navigation.
  md: { gap: "gap-2.5", mark: "size-8", name: "text-[1.5rem]", native: "text-[1.3125rem]", rule: "h-[1.125rem]" },
  // The footer.
  lg: { gap: "gap-3", mark: "size-10", name: "text-[1.875rem]", native: "text-[1.625rem]", rule: "h-6" },
} as const;

/**
 * The mark and the name set together: BODH in the display serif, letter-spaced
 * like an inscription, and बोध after a hairline. Its accessible name is the
 * name alone; the Devanagari spells the same word.
 */
export function Wordmark({ size = "md" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className={`flex items-center ${s.gap}`}>
      <BrandMark className={`${s.mark} text-ink`} />
      {/* The negative margin takes back the tracking after the last letter, so the name sits centred. */}
      <span className={`-mr-[0.15em] font-display ${s.name} leading-none font-normal tracking-[0.15em] text-ink`}>
        {BRAND.name}
      </span>
      {BRAND.devanagari && (
        <>
          <span aria-hidden className={`${s.rule} w-px bg-rule-strong`} />
          <span aria-hidden lang="hi" className={`font-deva ${s.native} leading-none text-ink-muted`}>
            {BRAND.devanagari}
          </span>
        </>
      )}
    </span>
  );
}
