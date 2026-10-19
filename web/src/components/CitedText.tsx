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

/** A passage an editorial text may cite: enough to link it and preview it. */
export interface EditorialLink {
  id: string;
  short_ref: string;
  path: string;
  ref?: string;
  translation?: string;
}

// A reference as editors write them, in parentheses: "2.47" (the Gita),
// "2.62–2.63", "Katha 1.2.18", "Isha 2", or several separated by commas.
const GROUP = /\(([^()]{1,80})\)/g;
const REFERENCE =
  /\b(Katha|Isha|Kena)\s+(\d+(?:\.\d+){0,2})((?:\s*[–-]\s*(?:(?:Katha|Isha|Kena)\s+)?\d+(?:\.\d+){0,2})?)|\b(\d{1,2})\.(\d{1,3})((?:\s*[–-]\s*\d{1,2}\.\d{1,3})?)\b/g;
// A group that holds nothing but references loses its parentheses: the chips say enough.
const ONLY_REFERENCES = /^(?:\s*(?:,|and|repeated in)?\s*(?:(?:Katha|Isha|Kena)\s+)?\d+(?:\.\d+){0,2}(?:\s*[–-]\s*(?:(?:Katha|Isha|Kena)\s+)?\d+(?:\.\d+){0,2})?)+\s*$/;

/**
 * Editorial text (theme summaries, stories) with its references to passages
 * as the same citation chips as an answer's: a Gita reference always, others
 * when the passage is one of `links`. Anything else, including a reference
 * that cannot be resolved, stays exactly as written. `interactive={false}`
 * draws the chips without links, for text inside a link of its own.
 */
export function EditorialText({
  text,
  links = [],
  className,
  inline = false,
  interactive = true,
}: {
  text: string;
  links?: EditorialLink[];
  className?: string;
  inline?: boolean;
  interactive?: boolean;
}) {
  const byId = new Map(links.map((link) => [link.id, link]));
  const byRef = new Map(links.map((link) => [link.short_ref, link]));
  const render = (part: string) => renderReferences(part, byId, byRef, interactive);
  if (inline) return <>{render(text)}</>;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i > 0 ? "mt-3" : undefined}>
          {render(paragraph)}
        </p>
      ))}
    </div>
  );
}

function renderReferences(
  text: string,
  byId: Map<string, EditorialLink>,
  byRef: Map<string, EditorialLink>,
  interactive: boolean,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const group of text.matchAll(GROUP)) {
    const start = group.index ?? 0;
    const inner = group[1];
    const chips: ReactNode[] = [];
    let cursor = 0;
    let resolved = 0;
    for (const match of inner.matchAll(REFERENCE)) {
      const at = match.index ?? 0;
      let link: { href: string; label: string; passage?: PassageLink } | null = null;
      if (match[1]) {
        const known = byRef.get(`${match[1]} ${match[2]}`);
        const label = `${match[1]} ${match[2]}${match[3].trim()}`;
        // Without a link to make, a chip only marks the reference, so it needs no lookup.
        if (known || !interactive) link = { href: known?.path ?? "", label, passage: known };
      } else {
        const id = `bg.${match[4]}.${match[5]}`;
        const known = byId.get(id);
        const href = passageHref(id, known);
        if (href) link = { href, label: `BG ${match[4]}.${match[5]}${match[6].replace(/\s+/g, "")}`, passage: known };
      }
      if (!link) continue;
      resolved += 1;
      if (at > cursor) chips.push(<Fragment key={`t${start}-${cursor}`}>{inner.slice(cursor, at)}</Fragment>);
      chips.push(
        interactive ? (
          <Citation key={`c${start}-${at}`} href={link.href} label={link.label} passage={link.passage} />
        ) : (
          <span key={`c${start}-${at}`} className={CHIP}>
            {link.label}
          </span>
        ),
      );
      cursor = at + match[0].length;
    }
    if (!resolved) continue;
    if (cursor < inner.length) chips.push(<Fragment key={`t${start}-end`}>{inner.slice(cursor)}</Fragment>);
    if (start > last) nodes.push(<Fragment key={`t${last}`}>{text.slice(last, start)}</Fragment>);
    const bare = ONLY_REFERENCES.test(inner);
    nodes.push(
      <Fragment key={`g${start}`}>
        {!bare && "("}
        {chips}
        {!bare && ")"}
      </Fragment>,
    );
    last = start + group[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return nodes;
}

const CHIP =
  "mx-0.5 inline-flex items-baseline rounded-md bg-source-bg px-1.5 font-sans text-[0.78em] font-semibold whitespace-nowrap text-source not-italic ring-1 ring-source/25 ring-inset";

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
        className={`${CHIP} transition-[box-shadow,background-color] hover:bg-accent-soft hover:ring-source/60`}
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
