import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { Ornament } from "@/components/Ornament";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { ThemeExplorer, type ExplorerPath } from "@/components/ThemeExplorer";
import { VerseLines } from "@/components/VerseCard";
import { getConcepts, getPassage } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { speakerLine } from "@/lib/passages";
import { THEME_PATHS } from "@/lib/themePaths";
import type { Concept, Passage, PassageDetail } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

import { ChapterHeading } from "./ChapterHeading";
import { ReturnToQuestion } from "./ReturnToQuestion";
import { StepList } from "./StepList";

// The landing page's shell, like the invitation above (globals.css).
const FRAME = "relative z-10 mx-auto w-full max-w-(--shell) px-(--page-x)";

// Passages that stand on their own out of context; three are shown, a
// different selection each day. Passages on death or battle are deliberately
// not here.
const TEACHINGS = ["bg.2.47", "bg.6.5", "katha.2.2", "bg.2.14", "bg.12.13", "bg.2.48", "bg.2.70"];

// The passages the understanding chapter shows at work.
const DISCOVERED = "bg.6.35";
const DECIDED = "bg.18.63";

async function passage(id: string): Promise<PassageDetail | null> {
  try {
    return await getPassage(id);
  } catch {
    return null;
  }
}

/** Chapters two to five of the landing story; the first, the invitation, belongs to the conversation. */
export function LandingStory() {
  return (
    <>
      <section
        id="teachings"
        aria-labelledby="teachings-title"
        className="relative z-10 scroll-mt-16 overflow-x-clip pt-28 pb-24 sm:pt-40 sm:pb-32"
      >
        <div className={FRAME}>
          <ChapterHeading number={2} label="Teachings" id="teachings-title" title="Read the words themselves.">
            <p className="max-w-2xl">
              Passages from the Bhagavad Gita and the Upanishads, exactly as printed in public-domain editions: the
              Sanskrit, a transliteration and the translation, each linked to the page it comes from. A different
              selection each day.
            </p>
          </ChapterHeading>
          <Suspense fallback={<LeavesSkeleton />}>
            <Leaves />
          </Suspense>
          <div className="reveal mt-16 flex justify-center">
            <Link href="/explore" className={buttonClass("secondary", "lg", "bg-paper/70 backdrop-blur-md")}>
              Explore the library
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section id="themes" aria-labelledby="themes-title" className="relative z-10 scroll-mt-16 overflow-x-clip py-24 sm:py-32">
        <div className={FRAME}>
          <ChapterHeading number={3} label="Themes" id="themes-title" title="Find your way in.">
            <p className="max-w-2xl">
              Start from the kind of situation you are in. Each path gathers the themes the texts speak to, and each
              theme the passages behind it.
            </p>
          </ChapterHeading>
          <div className="mt-14 sm:mt-16">
            <Suspense fallback={<div aria-hidden className="skeleton h-[34rem] rounded-[1.75rem]" />}>
              <Themes />
            </Suspense>
          </div>
        </div>
      </section>

      <section
        id="understanding"
        aria-labelledby="understanding-title"
        className="relative z-10 scroll-mt-16 overflow-x-clip py-24 sm:py-32"
      >
        <Suspense fallback={<div aria-hidden className={`${FRAME} skeleton h-[60rem]`} />}>
          <Understanding />
        </Suspense>
      </section>

      <section
        id="return"
        aria-labelledby="return-title"
        className="relative z-10 flex min-h-svh scroll-mt-16 flex-col justify-center overflow-x-clip py-24 portrait:justify-start portrait:pt-[calc(20lvh+min(25vw,10lvh)+2rem)]"
      >
        <div className={FRAME}>
          <div className="max-w-[38rem] short-landscape:max-w-[min(38rem,58vw)]">
            <ChapterHeading
              number={5}
              label="Return"
              id="return-title"
              title={
                <>
                  What would you like <em className="text-accent">to understand?</em>
                </>
              }
            >
              <p className="max-w-lg">
                Bring it in your own words. The passages, their sources and room to think will be there with you.
              </p>
            </ChapterHeading>
            <div className="reveal mt-10 flex flex-wrap items-center gap-3">
              <ReturnToQuestion />
              <Link href="/explore" className={buttonClass("secondary", "lg", "bg-paper/70 backdrop-blur-md")}>
                Explore the library
              </Link>
            </div>
            {/* The story closes as the name promises. */}
            <p className="reveal mt-12 flex items-center gap-3 text-[0.9375rem] text-ink-soft">
              <BrandMark className="size-6 text-ink" />
              {BRAND.philosophy}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- Teachings */

async function Leaves() {
  await connection();
  const now = new Date();
  const day = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86_400_000);
  const ids = [0, 2, 4].map((k) => TEACHINGS[(day + k) % TEACHINGS.length]);
  const details = (await Promise.all(ids.map(passage))).filter((d): d is PassageDetail => d !== null);
  if (!details.length) {
    return (
      <p className="mt-14 max-w-xl text-ink-muted">
        The texts can’t be reached right now. They will be back shortly; you can still ask a question.
      </p>
    );
  }
  return (
    <ol className="mt-16 space-y-14 sm:mt-24 sm:space-y-24">
      {details.map((detail, i) => (
        <Leaf key={detail.passage.id} passage={detail.passage} themes={detail.concepts.slice(0, 2)} index={i} />
      ))}
    </ol>
  );
}

function LeavesSkeleton() {
  return (
    <div aria-hidden className="mt-16 space-y-14 sm:mt-24">
      <div className="skeleton h-[26rem] max-w-[62rem] rounded-[10px]" />
      <div className="skeleton ml-auto h-[26rem] max-w-[62rem] rounded-[10px]" />
    </div>
  );
}

/**
 * A passage set as a leaf of a pothi, the long, loose-leaf manuscript of
 * Indian texts, with its binding holes. Nothing on it is generated.
 */
function Leaf({ passage, themes, index }: { passage: Passage; themes: { id: string; name: string }[]; index: number }) {
  const place =
    passage.source_id === "bhagavad-gita"
      ? passage.chapter_title && `Chapter ${passage.chapter}: ${passage.chapter_title}`
      : passage.chapter_title;
  const meta = [speakerLine(passage), place].filter(Boolean).join(" · ");
  const align = ["lg:mr-auto", "lg:ml-auto", "lg:mx-auto"][index % 3];
  return (
    <li className={`max-w-[62rem] ${align}`}>
      <article aria-label={passage.ref} data-passage={passage.id} className="leaf reveal-tilt">
        <header className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <Label kind="source" />
            <h3 className="display mt-3 text-[1.875rem] leading-tight text-ink sm:text-[2.25rem]">
              <Link href={passage.path} className="decoration-gold/60 underline-offset-[6px] hover:underline">
                {passage.ref}
              </Link>
            </h3>
            {meta && <p className="mt-1 text-[0.8125rem] text-ink-muted">{meta}</p>}
          </div>
          <ProvenanceBadge provenance={passage.provenance} />
        </header>

        {passage.sanskrit && (
          <p
            lang="sa"
            className="deva relative mt-9 text-center text-[clamp(1.25rem,2.3vw,1.875rem)] whitespace-pre-line text-ink [overflow-wrap:anywhere]"
          >
            <VerseLines text={passage.sanskrit} />
          </p>
        )}
        {passage.transliteration && (
          <p
            lang="sa-Latn"
            className="relative mt-3 text-center font-serif text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-muted italic [overflow-wrap:anywhere]"
          >
            <VerseLines text={passage.transliteration} />
          </p>
        )}
        {passage.sanskrit && <Ornament className="relative mx-auto mt-8 w-28 text-gold/70" />}

        <blockquote
          className={`relative font-serif text-[clamp(1.1875rem,2vw,1.5625rem)] leading-[1.7] text-pretty text-ink ${
            passage.sanskrit ? "mt-8" : "mt-9"
          }`}
        >
          {passage.translation}
        </blockquote>

        <footer className="relative mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gold/25 pt-4 text-[0.8125rem] text-ink-muted">
          <span>
            Translated by <span className="text-ink-soft">{passage.translator}</span>
          </span>
          <a
            href={passage.citation.scan_url ?? passage.citation.url}
            target="_blank"
            rel="noreferrer"
            title={passage.citation.label}
            className="font-medium text-ink-soft underline decoration-rule-strong underline-offset-[3px] transition-colors hover:text-ink hover:decoration-accent"
          >
            {passage.citation.scan_url
              ? `Printed page${passage.citation.page ? ` ${passage.citation.page}` : ""} ↗`
              : "Source text ↗"}
          </a>
          {themes.length > 0 && (
            <span className="flex flex-wrap items-center gap-x-2">
              <Label kind="editorial">Theme</Label>
              {themes.map((theme, i) => (
                <span key={theme.id}>
                  <Link href={`/concepts/${theme.id}`} className="text-ink-soft hover:text-ink hover:underline">
                    {theme.name}
                  </Link>
                  {i < themes.length - 1 && ","}
                </span>
              ))}
            </span>
          )}
          <Link
            href={passage.path}
            className="group inline-flex items-center gap-1 font-medium text-ink-soft transition-colors hover:text-ink sm:ml-auto"
          >
            Read in context
            <Icon name="arrowRight" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </footer>
      </article>
    </li>
  );
}

/* ------------------------------------------------------------------- Themes */

async function Themes() {
  await connection();
  let concepts: Concept[] = [];
  try {
    concepts = (await getConcepts()) ?? [];
  } catch {
    // The chapter says so below.
  }
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const paths: ExplorerPath[] = THEME_PATHS.map((path) => ({
    id: path.id,
    title: path.title,
    description: path.description,
    themes: path.themes
      .map((id) => byId.get(id))
      .filter((c) => c !== undefined)
      .map((c) => ({ id: c.id, name: c.name, summary: c.summary })),
  })).filter((path) => path.themes.length > 0);
  if (!paths.length) {
    return <p className="max-w-xl text-ink-muted">The themes can’t be reached right now.</p>;
  }
  return <ThemeExplorer paths={paths} pathLinks="page" />;
}

/* ------------------------------------------------------------ Understanding */

const STEPS = [
  { id: "step-describe", title: "Describe a real situation" },
  { id: "step-discover", title: "Discover relevant passages" },
  { id: "step-examine", title: "Examine their context and source" },
  { id: "step-consider", title: "Consider an interpretation, when available" },
  { id: "step-decide", title: "Make your own decision" },
];

async function Understanding() {
  await connection();
  const [found, decided] = await Promise.all([passage(DISCOVERED), passage(DECIDED)]);
  const shown = found?.passage;
  return (
    <div className={`${FRAME} grid grid-cols-1 gap-x-20 gap-y-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}>
      <div className="lg:sticky lg:top-28 lg:self-start">
        {/* बोध is understanding: the chapter carries the name. */}
        <ChapterHeading
          number={4}
          label="Understanding"
          devanagari={BRAND.devanagari}
          id="understanding-title"
          size="md"
          title="From reflection to understanding."
        >
          <p>What happens when you ask, step by step, and where the texts end and the interpretation begins.</p>
        </ChapterHeading>
        <StepList steps={STEPS} />
      </div>

      <ol className="space-y-6 lg:space-y-[18vh] lg:pt-[8vh] lg:pb-[20vh]">
        <Step index={0}>
          <p>
            Write it as you would tell a friend you trust, in English, <span lang="hi">हिन्दी</span> or Hinglish. A
            situation helps more than an abstract question: what happened, what you are weighing, what you fear.
          </p>
          <figure className="mt-7 rounded-2xl bg-surface-raised/90 p-6 shadow-card ring-1 ring-rule backdrop-blur-md">
            <figcaption className="eyebrow text-ink-muted">For example</figcaption>
            <blockquote className="display mt-3 text-[1.625rem] leading-snug text-ink">
              “My exams are next month and I can’t concentrate. I keep comparing myself with my friends.”
            </blockquote>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
              <Icon name="lock" className="size-3.5" />
              Your question is not stored on our server.
            </p>
          </figure>
        </Step>

        <Step index={1}>
          <p>
            The situation is matched against a verified collection by meaning, by the words of the translation and by
            theme. Only passages that are in the texts can come back.
          </p>
          {shown && (
            <figure aria-label={shown.ref} className="leaf leaf-compact mt-7">
              <p className="relative flex flex-wrap items-center justify-between gap-2">
                <Label kind="source" />
                <ProvenanceBadge provenance={shown.provenance} />
              </p>
              {shown.sanskrit && (
                <p lang="sa" className="deva relative mt-5 text-center text-[1.1875rem] whitespace-pre-line text-ink [overflow-wrap:anywhere]">
                  <VerseLines text={shown.sanskrit} />
                </p>
              )}
              <blockquote className="relative mt-5 font-serif text-[1.125rem] leading-[1.7] text-pretty text-ink">
                {shown.translation}
              </blockquote>
              <figcaption className="relative mt-4 text-[0.8125rem] text-ink-muted">
                <Link href={shown.path} className="font-medium text-ink-soft hover:text-ink hover:underline">
                  {shown.ref}
                </Link>{" "}
                · tr. {shown.translator}
              </figcaption>
            </figure>
          )}
        </Step>

        <Step index={2}>
          <p>
            Every passage shows who is speaking and where, the translator and the edition, and a link to the printed
            page. Any verse opens among the verses around it.
          </p>
          {shown && (
            <dl className="mt-7 divide-y divide-rule rounded-2xl bg-surface-raised/90 px-6 text-[0.9375rem] shadow-card ring-1 ring-rule backdrop-blur-md">
              <Fact term="Passage">{shown.ref}</Fact>
              {speakerLine(shown) && <Fact term="Speaking">{speakerLine(shown)}</Fact>}
              {shown.chapter_title && <Fact term="Chapter">{shown.chapter_title}</Fact>}
              <Fact term="Translation">{shown.translator}</Fact>
              <Fact term="Sanskrit">
                <ProvenanceBadge provenance={shown.provenance} />
              </Fact>
              <Fact term="Printed page">
                <a
                  href={shown.citation.scan_url ?? shown.citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent"
                >
                  {shown.citation.scan_url
                    ? shown.citation.page
                      ? `Page ${shown.citation.page} ↗`
                      : "Printed page ↗"
                    : "Source text ↗"}
                </a>
              </Fact>
              <Fact term="In context">
                <Link href={shown.path} className="font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent">
                  Read the surrounding verses
                </Link>
              </Fact>
            </dl>
          )}
        </Step>

        <Step index={3}>
          <p>
            When a language model is available, it explains how the passages might bear on your situation and
            suggests small next steps. It may cite only the passages that were found, and every citation is checked
            before you see it. When no model is available, you get the passages alone, clearly marked.
          </p>
          <ul className="mt-7 space-y-3 text-[0.9375rem]">
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface-raised/90 px-5 py-4 shadow-card ring-1 ring-rule backdrop-blur-md">
              <Label kind="source" />
              <span className="text-ink-soft">The texts, exactly as printed, in a serif face.</span>
            </li>
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-ai-bg/95 px-5 py-4 ring-1 ring-ai/20">
              <Label kind="ai" />
              <span className="text-ink-soft">The model’s reading, always labelled, in the interface face.</span>
            </li>
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-info-bg/95 px-5 py-4 ring-1 ring-info/20">
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-info">
                <Icon name="info" className="size-4" />
                Passages only
              </span>
              <span className="text-ink-soft">What you see when no model is configured: no interpretation at all.</span>
            </li>
          </ul>
        </Step>

        <Step index={4}>
          <p>
            The Gita ends its teaching the same way: reflect on it fully, then choose. Keep what helped, with your own
            notes, in this browser.
          </p>
          {decided && (
            <figure aria-label={decided.passage.ref} className="leaf leaf-compact mt-7">
              <p className="relative">
                <Label kind="source" />
              </p>
              <blockquote className="relative mt-4 font-serif text-[1.1875rem] leading-[1.7] text-pretty text-ink">
                {decided.passage.translation}
              </blockquote>
              <figcaption className="relative mt-4 text-[0.8125rem] text-ink-muted">
                <Link href={decided.passage.path} className="font-medium text-ink-soft hover:text-ink hover:underline">
                  {decided.passage.ref}
                </Link>{" "}
                · tr. {decided.passage.translator}
              </figcaption>
            </figure>
          )}
          <Link href="/reflections" className="group mt-7 inline-flex items-center gap-2 font-medium text-ink">
            <Icon name="bookmark" className="size-4" />
            Your reflections
            <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Step>
      </ol>
    </div>
  );
}

function Step({ index, children }: { index: number; children: ReactNode }) {
  const step = STEPS[index];
  return (
    <li id={step.id} className="reveal scroll-mt-28 rounded-[1.75rem] lg:min-h-[52vh]">
      <p aria-hidden className="font-serif text-[2.75rem] leading-none text-gold tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </p>
      <h3 className="display mt-4 text-[clamp(1.875rem,3vw,2.625rem)] leading-[1.05] text-ink">{step.title}</h3>
      <div className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">{children}</div>
    </li>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
