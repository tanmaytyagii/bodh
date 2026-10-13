"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { CitedText } from "@/components/CitedText";
import { FeedbackButton } from "@/components/FeedbackButton";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { Ornament } from "@/components/Ornament";
import { SafetyPanel } from "@/components/SafetyPanel";
import { VerseCard } from "@/components/VerseCard";
import type { Answer, Passage, PassageLink, Teaching } from "@/lib/types";
import { panelHeading } from "@/lib/ui";

import { SaveButton } from "./SaveButton";

const TIMEFRAME: Record<string, string> = { today: "Today", this_week: "This week", ongoing: "Ongoing" };

/** Model-written prose: the interface sans, never the scripture serif. */
const AI_PROSE = "text-[1.0625rem] leading-[1.75] text-ink sm:text-[1.125rem]";

type SectionName = "reply" | "passages" | "understanding" | "steps" | "reflect" | "readings" | "related" | "sources";

/** The sections of a written answer, in reading order, for its toolbar. */
function answerContents(answer: Answer): { name: SectionName; title: string }[] {
  const followUp = answer.kind === "follow_up";
  const list: { name: SectionName; title: string }[] = [];
  if (followUp && answer.message) list.push({ name: "reply", title: "Reply" });
  if (answer.teachings.length) list.push({ name: "passages", title: "Passages" });
  if (!followUp && answer.situation) list.push({ name: "understanding", title: "Understanding" });
  if (answer.steps.length) list.push({ name: "steps", title: "Path forward" });
  if (answer.reflective_question) list.push({ name: "reflect", title: "Reflect" });
  if (answer.alternative_readings) list.push({ name: "readings", title: "Other readings" });
  if (answer.related.length) list.push({ name: "related", title: "Related" });
  list.push({ name: "sources", title: "Sources" });
  return list;
}

/**
 * One answer as a reading column, in order: whether AI guidance was written
 * (and how it was checked); the passages, exactly as printed; the
 * interpretation, only where a model wrote one, beneath the passage it reads;
 * the steps; the follow-up (passed in for the latest answer); and a colophon
 * with the sources, the checks and what you can do with the answer. A compact
 * toolbar stays under the navigation while you read.
 *
 * `layout="inline"` drops the toolbar, for answers shown inside a saved reflection.
 */
export function AnswerPanel({
  question,
  answer,
  layout = "full",
  followUp,
}: {
  question: string;
  answer: Answer;
  layout?: "full" | "inline";
  /** The follow-up box, shown after the answer and before its sources. */
  followUp?: ReactNode;
}) {
  const passages = new Map<string, PassageLink>();
  for (const r of answer.references ?? []) passages.set(r.id, r);
  for (const p of answer.passages) passages.set(p.id, p);
  for (const t of answer.teachings) passages.set(t.passage.id, t.passage);
  for (const r of answer.related) passages.set(r.passage.id, r.passage);

  if (answer.kind === "crisis") {
    return (
      <div>
        <div className="space-y-10">
          {answer.message && (
            <p className="text-[1.1875rem] leading-[1.75] whitespace-pre-line text-ink">{answer.message}</p>
          )}
          {answer.safety && <SafetyPanel resources={answer.safety.resources} urgent />}
        </div>
        {followUp && <div className="mt-16">{followUp}</div>}
      </div>
    );
  }

  if (answer.kind === "out_of_scope" || answer.kind === "clarification") {
    return (
      <div>
        <div className="border-l-2 border-accent/60 pl-6">
          {answer.kind === "clarification" && answer.situation && (
            <p className="mb-3 text-[0.9375rem] leading-relaxed text-ink-soft">{answer.situation}</p>
          )}
          <p className={AI_PROSE}>{answer.message}</p>
          {answer.kind === "clarification" && (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-ink-muted">
              <Icon name="reply" className="size-4" />
              Reply below to continue.
            </p>
          )}
        </div>
        {followUp && <div className="mt-16">{followUp}</div>}
      </div>
    );
  }

  const sectionId = (name: SectionName) => `${answer.id}-${name}`;
  const passageId = (index: number) => `${answer.id}-passage-${index + 1}`;
  const retrievalOnly = answer.kind === "retrieval_only";
  const toolbarItems = retrievalOnly
    ? answer.passages.map((p, i) => ({ id: passageId(i), title: p.short_ref }))
    : answerContents(answer).map((c) => ({ id: sectionId(c.name), title: c.title }));

  return (
    <div>
      {layout === "full" && (
        <ReadingToolbar
          label={retrievalOnly ? "Passages in this answer" : "Sections of this answer"}
          items={toolbarItems}
          action={<SaveButton question={question} answer={answer} compact />}
        />
      )}
      <AvailabilityNote answer={answer} />
      {retrievalOnly ? (
        <PassageList answer={answer} id={sectionId("passages")} passageId={passageId} margin={layout === "full"} />
      ) : (
        <Guidance answer={answer} passages={passages} sectionId={sectionId} margin={layout === "full"} />
      )}
      {followUp && <div className="mt-20">{followUp}</div>}
      <Colophon id={sectionId("sources")} question={question} answer={answer} />
    </div>
  );
}

/**
 * A compact bar that stays under the navigation: where you can go in this
 * answer, and saving it. It is clear until it sticks, so it never cuts across
 * the scene; once stuck, its backdrop reaches up to the top of the screen
 * across the reading column, so text scrolling away never shows between the
 * navigation's pills. A hairline along its foot shows how far you have read.
 */
function ReadingToolbar({
  label,
  items,
  action,
}: {
  label: string;
  items: { id: string; title: string }[];
  action: ReactNode;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const element = marker.current;
    const bar = element?.nextElementSibling;
    if (!element || !bar) return;
    const top = parseFloat(getComputedStyle(bar).top) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top),
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={marker} aria-hidden />
      <div
        data-stuck={stuck}
        className="group/toolbar sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-3 mb-8 border-b border-rule px-3"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-[calc(4rem+env(safe-area-inset-top))] bottom-0 bg-paper opacity-0 transition-opacity duration-200 group-data-[stuck=true]/toolbar:opacity-100"
        />
        <div className="relative flex items-center gap-3">
          <nav aria-label={label} className="-mb-px min-w-0 flex-1 overflow-x-auto">
            <ol className="flex min-w-max items-center gap-0.5 py-2">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex h-9 items-center rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="#follow-up"
                  className="ml-1 flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-accent transition-colors hover:bg-accent-soft"
                >
                  Follow up
                  <Icon name="arrowRight" className="size-3.5 rotate-90" />
                </a>
              </li>
            </ol>
          </nav>
          <div className="shrink-0">{action}</div>
        </div>
        <span aria-hidden className="reading-progress pointer-events-none absolute inset-x-0 -bottom-px h-[2px] origin-left bg-accent" />
      </div>
    </>
  );
}

/**
 * Whether a model wrote any of this answer, said plainly before anything
 * else. Without one, the passages come from search alone.
 */
function AvailabilityNote({ answer }: { answer: Answer }) {
  const retrievalOnly = answer.kind === "retrieval_only";
  const titleId = `${answer.id}-availability`;
  return (
    <section
      role="note"
      aria-labelledby={titleId}
      className="flex gap-4 border-y border-rule py-5 text-[0.9375rem] leading-relaxed"
    >
      <Icon name={retrievalOnly ? "info" : "pen"} className="mt-1 size-[1.125rem] text-ink-muted" />
      <div className="min-w-0">
        <h3 id={titleId} className="font-semibold text-ink">
          {retrievalOnly ? "Passages only — no AI interpretation" : "Interpretation written from these passages"}
        </h3>
        <p className="mt-1 max-w-2xl text-ink-soft">
          {retrievalOnly ? (
            <>
              AI guidance isn’t available right now, so these passages were found by search alone. Nothing below was
              written by a model — read each passage in its context.
            </>
          ) : (
            <>
              A language model{answer.generated_by ? ` (${answer.generated_by.model})` : ""} read the passages below
              and wrote the parts marked as interpretation; it could cite only these passages
              {answer.verification?.checked ? ", and its citations were checked against them before display" : ""}.
            </>
          )}
        </p>
        {retrievalOnly && answer.notice && (
          <details className="group mt-2 text-[0.8125rem] text-ink-muted">
            <summary className="inline-flex items-center gap-1 font-medium transition-colors hover:text-ink">
              <Icon name="chevronRight" className="size-3.5 transition-transform group-open:rotate-90" />
              Technical details
            </summary>
            <p className="mt-1.5 max-w-2xl pl-[1.125rem]">{answer.notice}</p>
          </details>
        )}
      </div>
    </section>
  );
}

/** The passages found by search, one after another, each exactly as printed. */
function PassageList({
  answer,
  id,
  passageId,
  margin,
}: {
  answer: Answer;
  id: string;
  passageId: (index: number) => string;
  /** Number the passages in the page margin (not inside a saved reflection, which has none). */
  margin: boolean;
}) {
  const count = answer.passages.length;
  const themes = answer.retrieval?.concepts ?? [];
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 scroll-mt-36">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 id={`${id}-title`} className="eyebrow text-ink-muted">
          {count} passage{count === 1 ? "" : "s"} found
        </h3>
        {themes.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-muted">
            <Label kind="editorial">Themes</Label>
            {themes.map((theme, i) => (
              <span key={theme.id}>
                <Link href={`/concepts/${theme.id}`} className="text-ink-soft underline-offset-2 hover:text-ink hover:underline">
                  {theme.name}
                </Link>
                {i < themes.length - 1 && ","}
              </span>
            ))}
          </p>
        )}
      </div>
      {count ? (
        <ol className="mt-5">
          {answer.passages.map((p, i) => (
            <li key={p.id}>
              <VerseCard
                passage={p}
                variant="reading"
                number={margin ? i + 1 : undefined}
                headingLevel={4}
                id={passageId(i)}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-ink-muted">No matching passages were found. Try describing the situation differently.</p>
      )}
    </section>
  );
}

function Guidance({
  answer,
  passages,
  sectionId,
  margin,
}: {
  answer: Answer;
  passages: Map<string, PassageLink>;
  sectionId: (name: SectionName) => string;
  margin: boolean;
}) {
  const followUp = answer.kind === "follow_up";
  const number = (n: number) => (followUp ? undefined : n);
  const allGita = answer.teachings.every((t) => t.passage.source_id === "bhagavad-gita");

  return (
    <div className="mt-14 space-y-24">
      {answer.safety && <SafetyPanel resources={answer.safety.resources} message={answer.safety.message} />}

      {followUp && answer.message && (
        <Chapter id={sectionId("reply")} title="Reply" kind="ai" margin={margin}>
          <CitedText text={answer.message} passages={passages} className={AI_PROSE} />
        </Chapter>
      )}
      {followUp && (answer.evidence === "limited" || answer.kind === "insufficient_sources") && (
        <LimitedNote answer={answer} passages={passages} />
      )}

      {answer.teachings.length > 0 && (
        <Chapter
          id={sectionId("passages")}
          title={followUp ? "Passages" : allGita ? "What the Gita offers" : "What the texts offer"}
          number={number(1)}
          margin={margin}
        >
          <div className="space-y-6">
            {answer.teachings.map((teaching) => (
              <div key={teaching.passage.id}>
                <div className="reveal-tilt">
                  <VerseCard passage={teaching.passage} variant="reading" />
                </div>
                <Interpretation teaching={teaching} passages={passages} />
              </div>
            ))}
          </div>
        </Chapter>
      )}

      {!followUp && answer.situation && (
        <Chapter
          id={sectionId("understanding")}
          title="Understanding your situation"
          kind="ai"
          number={2}
          margin={margin}
        >
          <CitedText text={answer.situation} passages={passages} className={AI_PROSE} />
          {(answer.evidence === "limited" || answer.kind === "insufficient_sources") && (
            <LimitedNote answer={answer} passages={passages} />
          )}
        </Chapter>
      )}

      {answer.steps.length > 0 && (
        <Chapter id={sectionId("steps")} title="A path forward" kind="ai" number={number(3)} margin={margin}>
          {answer.path_forward_intro && (
            <CitedText text={answer.path_forward_intro} passages={passages} className={AI_PROSE} />
          )}
          <ol className="mt-8 divide-y divide-rule border-y border-rule">
            {answer.steps.map((step, i) => (
              <li key={i} className="reveal grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 py-6">
                <span aria-hidden className="font-serif text-[1.75rem] leading-none text-accent tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-[1.0625rem] font-semibold text-ink">{step.title}</p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                      <Icon name="clock" className="size-3.5" />
                      {TIMEFRAME[step.timeframe] ?? step.timeframe}
                    </span>
                  </div>
                  <CitedText text={step.detail} passages={passages} className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft" />
                </div>
              </li>
            ))}
          </ol>
          {answer.framework && (
            <div className="mt-8 border-l-2 border-rule-strong pl-5">
              <p className="eyebrow text-ink-muted">A way to think it through</p>
              <CitedText text={answer.framework} passages={passages} className="mt-2 text-[0.9375rem] leading-relaxed text-ink" />
            </div>
          )}
        </Chapter>
      )}

      {answer.reflective_question && (
        <section id={sectionId("reflect")} aria-labelledby={`${sectionId("reflect")}-title`} className="scroll-mt-36 py-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <h3 id={`${sectionId("reflect")}-title`} className="eyebrow text-ink-muted">
              {number(4) !== undefined && <span>{number(4)}. </span>}To reflect on
            </h3>
            <Label kind="ai" />
          </div>
          <Ornament className="mx-auto mt-6 w-32 text-gold" />
          <CitedText
            text={answer.reflective_question}
            passages={passages}
            className="display mx-auto mt-8 text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.18] text-balance text-ink italic"
          />
        </section>
      )}

      {answer.alternative_readings && (
        <Chapter id={sectionId("readings")} title="Other readings" kind="ai" margin={margin}>
          <CitedText text={answer.alternative_readings} passages={passages} className="text-[1.0625rem] leading-[1.75] text-ink-soft" />
        </Chapter>
      )}

      {answer.related.length > 0 && (
        <Chapter id={sectionId("related")} title="Related passages" margin={margin}>
          <ul className="divide-y divide-rule border-y border-rule">
            {answer.related.map(({ passage, reason }) => (
              <li key={passage.id}>
                <Link href={passage.path} className="group block py-5">
                  <span className="text-sm font-semibold text-source group-hover:underline">{passage.ref}</span>
                  <span className="mt-1.5 line-clamp-2 font-serif text-[1rem] leading-relaxed text-ink">{passage.translation}</span>
                  <span className="mt-2 block text-xs leading-snug text-ai">Why: {reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Chapter>
      )}
    </div>
  );
}

function LimitedNote({ answer, passages }: { answer: Answer; passages: Map<string, PassageLink> }) {
  return (
    <div role="note" className="mt-8 flex gap-4 border-y border-rule py-5 text-[0.9375rem] leading-relaxed">
      <Icon name="info" className="mt-1 size-[1.125rem] text-ink-muted" />
      <div className="min-w-0">
        <p className="font-semibold text-ink">The texts here do not speak to this directly</p>
        {answer.evidence_note && <CitedText text={answer.evidence_note} passages={passages} className="mt-1 text-ink-soft" />}
      </div>
    </div>
  );
}

/** What the model wrote about one passage, set beneath it and marked as its reading. */
function Interpretation({ teaching, passages }: { teaching: Teaching; passages: Map<string, PassageLink> }) {
  const rows: [string, string | null][] = [
    ["What it says", teaching.what_it_says],
    ["In its context", teaching.context],
    ["On the translator’s notes", teaching.interpretation_notes],
    ["Why it speaks to your situation", teaching.why_it_applies],
    ["One way to apply it", teaching.application],
    ["What it does not mean", teaching.limits],
  ];
  return (
    <div className="-mt-4 border-l-2 border-ai/40 pb-6 pl-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label kind="ai" />
        <span className="text-xs text-ink-muted">Written by the model from the passage above</span>
      </div>
      <dl className="mt-5 space-y-5">
        {rows
          .filter(([, value]) => value)
          .map(([title, value]) => (
            <Fragment key={title}>
              <div>
                <dt className="text-[0.8125rem] font-semibold text-ai">{title}</dt>
                <dd className="mt-1">
                  <CitedText text={value as string} passages={passages} className="text-[0.9375rem] leading-relaxed text-ink" />
                </dd>
              </div>
            </Fragment>
          ))}
      </dl>
      <div className="mt-6">
        <FeedbackButton passageId={teaching.passage.id} variant="link" label="Report a problem with this passage" />
      </div>
    </div>
  );
}

interface ChapterProps {
  id: string;
  title: string;
  number?: number;
  kind?: "ai";
  /** Hang the numeral in the page margin on wide screens. */
  margin: boolean;
  children: ReactNode;
}

/** A section of a written answer: its numeral (in the margin on wide screens), title and label, then content. */
function Chapter({ id, title, number, kind, margin, children }: ChapterProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative scroll-mt-36">
      <header className="reveal mb-8">
        {number !== undefined && (
          <span
            aria-hidden
            className={`mb-3 block font-serif text-[2.25rem] leading-none text-gold tabular-nums ${
              margin ? "xl:absolute xl:top-0 xl:-left-28 xl:mb-0 xl:w-20 xl:text-right" : ""
            }`}
          >
            {String(number).padStart(2, "0")}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 id={`${id}-title`} className="display text-[2rem] leading-[1.05] text-ink">
            {number !== undefined && <span className="sr-only">{number}. </span>}
            {title}
          </h3>
          {kind === "ai" && <Label kind="ai" />}
        </div>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Where the answer comes from, how it was checked, and what you can do with it. */
function Colophon({ id, question, answer }: { id: string; question: string; answer: Answer }) {
  const fixes = answer.verification?.issues.length ?? 0;
  const cited = uniquePassages(
    answer.kind === "retrieval_only"
      ? answer.passages
      : [...answer.teachings.map((t) => t.passage), ...answer.related.map((r) => r.passage)],
  );
  return (
    <section id={id} aria-label="Sources and verification" className="mt-20 scroll-mt-36 border-t border-rule-strong">
      <ColophonRow title={answer.kind === "retrieval_only" ? "Passages found" : "Passages in this answer"}>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {cited.map((p) => (
            <li key={p.id}>
              <Link href={p.path} className="group inline-flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-source group-hover:underline">{p.short_ref}</span>
                <span className="text-xs text-ink-muted">{p.chapter_title ?? p.source_title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </ColophonRow>
      <ColophonRow title="How this was checked">
        <ul className="space-y-1.5 text-[0.875rem] leading-relaxed text-ink-soft">
          {answer.verification?.checked ? (
            <li>
              Citations checked against the retrieved passages
              {fixes ? ` - ${fixes} problem${fixes > 1 ? "s" : ""} corrected before display` : ""}.
            </li>
          ) : (
            answer.kind === "retrieval_only" && <li>Found by search. No AI interpretation was generated.</li>
          )}
          {answer.retrieval && <li>Evidence in the corpus: {answer.retrieval.evidence}.</li>}
          {answer.generated_by && <li>Written by {answer.generated_by.model}.</li>}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Source text is shown exactly as printed in the cited edition; interpretations are the model’s and may be wrong.
          This is not religious or professional advice.
        </p>
      </ColophonRow>
      <ColophonRow title="Keep this reflection">
        <p className="text-[0.875rem] leading-relaxed text-ink-muted">Saved only in this browser, with room for your notes.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <SaveButton question={question} answer={answer} />
          <FeedbackButton answerId={answer.id} question={question} variant="toolbar" />
        </div>
      </ColophonRow>
    </section>
  );
}

function ColophonRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-3 border-b border-rule py-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <h3 className={panelHeading}>{title}</h3>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function uniquePassages(list: Passage[]): Passage[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
