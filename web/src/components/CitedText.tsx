"use client";

import Link from "next/link";
import { Fragment, useId, type ReactNode } from "react";

import { passageHref, passageLabel } from "@/lib/passages";
import type { PassageLink } from "@/lib/types";

const MARKER = /\[\[\s*([a-z0-9][a-z0-9._-]*)\s*\]\]/gi;

/** Renders model text, turning [[bg.2.47]] citation markers into links. */
export function CitedText({
  text,
  passages,
  className,
}: {
  text: string;
  passages?: Map<string, PassageLink>;
  className?: string;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i > 0 ? "mt-3" : undefined}>
          {renderInline(paragraph, passages)}
        </p>
      ))}
    </div>
  );
}

export function renderInline(text: string, passages?: Map<string, PassageLink>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(<Fragment key={`t${last}`}>{text.slice(last, index)}</Fragment>);
    const id = match[1].toLowerCase();
    const known = passages?.get(id);
    const href = passageHref(id, known);
    const label = passageLabel(id, known);
    nodes.push(
      href ? (
        <Citation key={`c${index}`} href={href} label={label} passage={known} />
      ) : (
        <span key={`c${index}`}>{label}</span>
      ),
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return nodes;
}

/**
 * A citation chip. Where the passage is known, hovering or focusing it (on
 * devices with a pointer) previews the reference and the opening of the
 * translation; the link always opens the verse.
 */
function Citation({ href, label, passage }: { href: string; label: string; passage?: PassageLink }) {
  const tipId = useId();
  const ref = passage && "ref" in passage ? String(passage.ref) : null;
  const translation = passage && "translation" in passage ? String(passage.translation) : null;
  const preview = translation && translation.length > 160 ? `${translation.slice(0, 157).trimEnd()}…` : translation;
  return (
    <span className="group/cite relative inline-block">
      <Link
        href={href}
        aria-describedby={preview ? tipId : undefined}
        className="mx-0.5 inline-flex items-baseline rounded-md bg-source-bg px-1.5 font-sans text-[0.78em] font-semibold whitespace-nowrap text-source not-italic ring-1 ring-source/25 transition-[box-shadow,background-color] ring-inset hover:bg-accent-soft hover:ring-source/60"
      >
        {label}
      </Link>
      {preview && (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 rounded-xl bg-surface-raised px-4 py-3 text-left font-sans text-[0.8125rem] leading-relaxed font-normal text-ink-soft not-italic shadow-overlay ring-1 ring-rule [@media(hover:hover)]:group-focus-within/cite:block [@media(hover:hover)]:group-hover/cite:block"
        >
          <span className="mb-1 block text-xs font-semibold text-source">{ref ?? label}</span>
          <span className="font-serif text-ink">{preview}</span>
        </span>
      )}
    </span>
  );
}
