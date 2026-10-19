"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { CitedText } from "@/components/CitedText";
import { FeedbackButton } from "@/components/FeedbackButton";
import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { Ornament } from "@/components/Ornament";
import { SafetyPanel } from "@/components/SafetyPanel";
import { VerseCard } from "@/components/VerseCard";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";
import type { Answer, Passage, PassageLink, PassageMatch, Teaching } from "@/lib/types";
import { panelHeading } from "@/lib/ui";

import { MatchNote } from "./MatchNote";
import { SaveButton, SavedStatus } from "./SaveButton";

const TIMEFRAME: Record<string, MessageKey> = { today: "time.today", this_week: "time.this_week", ongoing: "time.ongoing" };
const EVIDENCE: Record<string, MessageKey> = {
  strong: "evidence.strong",
  moderate: "evidence.moderate",
  limited: "evidence.limited",
  weak: "evidence.weak",
};

/** Model-written prose: the interface sans, never the scripture serif. Sized by the reading preference. */
const AI_PROSE = "text-[calc(1.0625rem*var(--reading-scale))] leading-[1.75] text-ink sm:text-[calc(1.125rem*var(--reading-scale))]";
const AI_SMALL = "text-[calc(0.9375rem*var(--reading-scale))] leading-relaxed text-ink";

type SectionName = "summary" | "reply" | "passages" | "steps" | "reflect" | "deeper";

/** The sections shown by default, in reading order, for the answer's toolbar. */
function answerContents(answer: Answer): { name: SectionName; title: MessageKey }[] {
  const followUp = answer.kind === "follow_up";
  const list: { name: SectionName; title: MessageKey }[] = [];
  const lead = leadOf(answer);
  if (lead === "summary") list.push({ name: "summary", title: "answer.inShort" });
  if (lead === "situation") list.push({ name: "summary", title: "answer.situation.short" });
  if (followUp && answer.message) list.push({ name: "reply", title: "answer.reply" });
  if (answer.teachings.length) list.push({ name: "passages", title: followUp ? "answer.passages" : "answer.passage" });
  if (answer.steps.length) list.push({ name: "steps", title: "answer.steps.short" });
  if (answer.reflective_question) list.push({ name: "reflect", title: "answer.reflect.short" });
  list.push({ name: "deeper", title: "answer.deeper" });
  return list;
}

/**
 * What opens the answer: the "In short" summary, or, for answers written
 * before there was one, the model's reading of the situation, under its own
 * name. Nothing is made up in its place.
 */
function leadOf(answer: Answer): "summary" | "situation" | null {
  if (answer.summary?.trim()) return "summary";
  if (answer.kind !== "follow_up" && answer.situation?.trim()) return "situation";
  return null;
}

/**
 * One answer as a reading column. What helps right away is shown first: the
 * question's "In short", the passage it rests on (exactly as printed, with
 * what it says and why it applies), the steps and a question to reflect on.
 * Everything else (context and limits, further passages, other readings,
 * related passages and how the answer was checked) is one click away under
 * "Go deeper". Then the passages it cites, and the follow-up (passed in for
 * the latest answer). A compact toolbar stays under the navigation while you
 * read, with the answer's one Save.
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
  /** The follow-up box, shown last, after the passages the answer cites. */
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
              <T k="answer.clarification.reply" />
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
    ? answer.passages.map((p, i) => ({ id: passageId(i), title: <>{p.short_ref}</> }))
    : answerContents(answer).map((c) => ({ id: sectionId(c.name), title: <T k={c.title} /> }));

  return (
    <div>
      {layout === "full" && (
        <ReadingToolbar
          label={retrievalOnly ? "answer.toolbar.passages" : "answer.toolbar.sections"}
          items={toolbarItems}
          action={<SaveButton question={question} answer={answer} />}
        />
      )}
      <AvailabilityNote answer={answer} />
      {retrievalOnly ? (
        <PassageList answer={answer} id={sectionId("passages")} passageId={passageId} margin={layout === "full"} />
      ) : (
        <Guidance answer={answer} passages={passages} sectionId={sectionId} margin={layout === "full"} />
      )}
      <AnswerSources answer={answer} question={question} />
      {followUp && <div className="mt-16">{followUp}</div>}
    </div>
  );
}

/**
 * A compact bar that stays under the navigation: where you can go in this
 * answer, with the section in view marked, and saving it. It is clear until
 * it sticks, so it never cuts across the scene; once stuck, its backdrop
 * reaches up to the top of the screen across the reading column, so text
 * scrolling away never shows between the navigation's pills. When its links
 * do not all fit, the row scrolls sideways and fades at the edge that has
 * more. A hairline along its foot shows how far you have read.
 */
function ReadingToolbar({
  label,
  items,
  action,
}: {
  label: MessageKey;
  items: { id: string; title: ReactNode }[];
  action: ReactNode;
}) {
  const t = useT();
  const marker = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [current, setCurrent] = useState<string | null>(null);

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

  // Fades show which side of the row has more links.
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      const start = element.scrollLeft > 1;
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((old) => (old.start === start && old.end === end ? old : { start, end }));
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    return () => {
      element.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  }, []);

  // The section in view: the last one whose top has passed a line a third of the way down the screen.
  const ids = items.map((item) => item.id).join(" ");
  useEffect(() => {
    const sections = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let active: string | null = null;
      for (const section of sections) if (section.getBoundingClientRect().top <= line) active = section.id;
      setCurrent(active);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  // Keep the marked link in view within the row, without moving the page.
  useEffect(() => {
    const element = row.current;
    const link = current ? element?.querySelector<HTMLElement>(`a[href="#${CSS.escape(current)}"]`) : null;
    if (!element || !link) return;
    const left = link.offsetLeft - element.offsetLeft;
    if (left < element.scrollLeft || left + link.offsetWidth > element.scrollLeft + element.clientWidth) {
      element.scrollTo({ left: Math.max(0, left - 24), behavior: "smooth" });
    }
  }, [current]);

  return (
    <>
      <div ref={marker} aria-hidden />
      <div
        data-stuck={stuck}
        className="group/toolbar sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-3 mb-6 border-b border-rule px-3"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-[calc(4rem+env(safe-area-inset-top))] bottom-0 bg-paper opacity-0 transition-opacity duration-200 group-data-[stuck=true]/toolbar:opacity-100"
        />
        <div className="relative flex items-center gap-2">
          <nav
            ref={row}
            aria-label={t(label)}
            data-fade-start={edges.start || undefined}
            data-fade-end={edges.end || undefined}
            className="scroll-fade -mb-px min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ol className="flex min-w-max items-center gap-0.5 py-2">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={current === item.id ? "location" : undefined}
                    onClick={() => openDisclosure(item.id)}
                    className="flex h-9 items-center rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink aria-[current=location]:bg-surface-sunk aria-[current=location]:text-ink"
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
                  <T k="answer.followUp" />
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

/** A link to a section inside "Go deeper" opens it first, so the browser can scroll to it. */
function openDisclosure(id: string) {
  const target = document.getElementById(id);
  const details = target instanceof HTMLDetailsElement ? target : target?.closest("details");
  if (details && !details.open) details.open = true;
}

/**
 * Whether a model wrote any of this answer, said plainly before anything else,
 * in one line; how it works opens beneath it. Without a model, the passages
 * come from search alone.
 */
function AvailabilityNote({ answer }: { answer: Answer }) {
  const retrievalOnly = answer.kind === "retrieval_only";
  const titleId = `${answer.id}-availability`;
  return (
    <section role="note" aria-labelledby={titleId} className="text-[0.9375rem] leading-relaxed">
      <details className="group">
        <summary className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface-sunk/80 px-3.5 py-1.5 text-[0.8125rem] ring-1 ring-rule">
            <Icon name={retrievalOnly ? "info" : "pen"} className="size-3.5 text-ink-muted" />
            <span id={titleId} className="font-semibold text-ink">
              <T k={retrievalOnly ? "answer.availability.passages" : "answer.availability.ai"} />
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink-muted transition-colors group-hover:text-ink">
            <T k="answer.availability.how" />
            <Icon name="chevronDown" className="size-3.5 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-3 max-w-2xl border-l-2 border-rule pl-4 text-ink-soft">
          {retrievalOnly ? (
            <p>
              <T k="answer.availability.passages.detail" />
            </p>
          ) : (
            <p>
              <T k="answer.availability.ai.detail" />
              {answer.verification?.checked && (
                <>
                  {" "}
                  <T k="answer.availability.ai.checked" />
                </>
              )}
              {answer.generated_by && (
                <>
                  {" "}
                  <T k="answer.availability.ai.model" values={{ model: answer.generated_by.model }} />
                </>
              )}
            </p>
          )}
          {retrievalOnly && answer.notice && (
            <p className="mt-2 text-[0.8125rem] text-ink-muted">
              <span className="font-medium">
                <T k="answer.technical" />:
              </span>{" "}
              {answer.notice}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

/** The passages found by search, one after another, each exactly as printed, with why it came up. */
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
  const matches = new Map<string, PassageMatch>((answer.retrieval?.matches ?? []).map((m) => [m.passage_id, m]));
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-36">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 id={`${id}-title`} className="eyebrow text-ink-muted">
          <T k={count === 1 ? "answer.found.one" : "answer.found.other"} values={{ count }} />
        </h3>
        {themes.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-muted">
            <Label kind="editorial">
              <T k="answer.themes" />
            </Label>
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
                annotation={<MatchNote match={matches.get(p.id)} />}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-ink-muted">
          <T k="answer.noPassages" />
        </p>
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
  const lead = leadOf(answer);
  const limited = answer.evidence === "limited" || answer.kind === "insufficient_sources";
  const [primary] = answer.teachings;

  return (
    <div className="mt-10 space-y-20">
      {/* Help comes before anything else when someone may be at risk. */}
      {answer.safety && <SafetyPanel resources={answer.safety.resources} message={answer.safety.message} />}

      {lead && (
        <section id={sectionId("summary")} aria-labelledby={`${sectionId("summary")}-title`} className="scroll-mt-36">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 id={`${sectionId("summary")}-title`} className="eyebrow text-ink-muted">
              <T k={lead === "summary" ? "answer.inShort" : "answer.situation"} />
            </h3>
            <Label kind="ai" />
          </div>
          <CitedText
            text={(lead === "summary" ? answer.summary : answer.situation) ?? ""}
            passages={passages}
            className="mt-3 text-[calc(1.25rem*var(--reading-scale))] leading-[1.6] text-pretty text-ink sm:text-[calc(1.375rem*var(--reading-scale))]"
          />
          {!followUp && limited && <LimitedNote answer={answer} passages={passages} />}
        </section>
      )}

      {followUp && answer.message && (
        <Chapter id={sectionId("reply")} title="answer.reply" kind="ai" margin={margin}>
          <CitedText text={answer.message} passages={passages} className={AI_PROSE} />
        </Chapter>
      )}
      {(followUp || !lead) && limited && <LimitedNote answer={answer} passages={passages} />}

      {primary && (
        <Chapter
          id={sectionId("passages")}
          title={followUp ? "answer.passages" : allGita ? "answer.passage.gita" : "answer.passage.texts"}
          number={number(1)}
          margin={margin}
        >
          <div className="reveal-tilt">
            <VerseCard passage={primary.passage} variant="reading" />
          </div>
          <Interpretation teaching={primary} passages={passages} rows={ESSENTIAL_ROWS} />
        </Chapter>
      )}

      {answer.steps.length > 0 && (
        <Chapter id={sectionId("steps")} title="answer.steps" kind="ai" number={number(2)} margin={margin}>
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
                    <p className="text-[calc(1.0625rem*var(--reading-scale))] font-semibold text-ink">{step.title}</p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                      <Icon name="clock" className="size-3.5" />
                      {TIMEFRAME[step.timeframe] ? <T k={TIMEFRAME[step.timeframe]} /> : step.timeframe}
                    </span>
                  </div>
                  <CitedText text={step.detail} passages={passages} className={`mt-2 ${AI_SMALL} text-ink-soft`} />
                </div>
              </li>
            ))}
          </ol>
        </Chapter>
      )}

      {answer.reflective_question && (
        <section id={sectionId("reflect")} aria-labelledby={`${sectionId("reflect")}-title`} className="scroll-mt-36 py-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <h3 id={`${sectionId("reflect")}-title`} className="eyebrow text-ink-muted">
              {number(3) !== undefined && <span>{number(3)}. </span>}
              <T k="answer.reflect" />
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

      <GoDeeper answer={answer} passages={passages} id={sectionId("deeper")} showSituation={lead === "summary"} />
    </div>
  );
}

/**
 * The rest of the answer, folded: the model's reading of the situation,
 * context and limits of the first passage, the other passages with their
 * readings, a way to think it through, other readings, related passages, and
 * how the answer was checked. Nothing is left out; it is one click away.
 */
function GoDeeper({
  answer,
  passages,
  id,
  showSituation,
}: {
  answer: Answer;
  passages: Map<string, PassageLink>;
  id: string;
  showSituation: boolean;
}) {
  const [primary, ...others] = answer.teachings;
  const fixes = answer.verification?.issues.length ?? 0;
  const deeperRows = primary ? DEEPER_ROWS.filter((row) => primary[row.field]) : [];

  return (
    <details id={id} className="group/deeper scroll-mt-36 border-y border-rule-strong">
      <summary className="flex items-center justify-between gap-4 py-6">
        <span className="min-w-0">
          <span className="display block text-[2rem] leading-[1.05] text-ink">
            <T k="answer.deeper" />
          </span>
          <span className="mt-1.5 block text-[0.875rem] text-ink-muted">
            <T k="answer.deeper.hint" />
          </span>
        </span>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-rule-strong transition-colors group-hover/deeper:ring-gold">
          <Icon name="chevronDown" className="size-5 text-ink transition-transform group-open/deeper:rotate-180" />
        </span>
      </summary>

      <div className="space-y-16 pt-4 pb-12">
        {showSituation && answer.situation && (
          <DeeperPart title="answer.situation" kind="ai">
            <CitedText text={answer.situation} passages={passages} className={AI_PROSE} />
          </DeeperPart>
        )}

        {primary && deeperRows.length > 0 && (
          <DeeperPart title="answer.moreOn" values={{ ref: primary.passage.short_ref }} kind="ai">
            <Interpretation teaching={primary} passages={passages} rows={deeperRows} bare />
          </DeeperPart>
        )}

        {others.length > 0 && (
          <DeeperPart title="answer.morePassages">
            <div className="space-y-6">
              {others.map((teaching) => (
                <div key={teaching.passage.id}>
                  <VerseCard passage={teaching.passage} variant="reading" />
                  <Interpretation teaching={teaching} passages={passages} rows={[...ESSENTIAL_ROWS, ...DEEPER_ROWS]} />
                </div>
              ))}
            </div>
          </DeeperPart>
        )}

        {answer.framework && (
          <DeeperPart title="answer.framework" kind="ai">
            <CitedText text={answer.framework} passages={passages} className={AI_PROSE} />
          </DeeperPart>
        )}

        {answer.alternative_readings && (
          <DeeperPart title="answer.readings" kind="ai">
            <CitedText text={answer.alternative_readings} passages={passages} className={`${AI_PROSE} text-ink-soft`} />
          </DeeperPart>
        )}

        {answer.related.length > 0 && (
          <DeeperPart title="answer.related">
            <ul className="divide-y divide-rule border-y border-rule">
              {answer.related.map(({ passage, reason }) => (
                <li key={passage.id}>
                  <Link href={passage.path} className="group block py-5">
                    <span className="text-sm font-semibold text-source group-hover:underline">{passage.ref}</span>
                    <span className="mt-1.5 line-clamp-2 font-serif text-[calc(1rem*var(--reading-scale))] leading-relaxed text-ink">
                      {passage.translation}
                    </span>
                    <span className="mt-2 block text-xs leading-snug text-ai">
                      <T k="answer.related.why" values={{ reason }} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </DeeperPart>
        )}

        <DeeperPart title="answer.checked">
          <ul className="space-y-1.5 text-[0.875rem] leading-relaxed text-ink-soft">
            {answer.verification?.checked && (
              <li>
                <T k="answer.checked.citations" />
                {fixes > 0 && (
                  <>
                    {" "}
                    <T k={fixes === 1 ? "answer.checked.corrected.one" : "answer.checked.corrected.other"} values={{ count: fixes }} />
                  </>
                )}
              </li>
            )}
            {answer.retrieval && (
              <li>
                <T
                  k="answer.checked.evidence"
                  values={{ level: EVIDENCE[answer.retrieval.evidence] ? <T k={EVIDENCE[answer.retrieval.evidence]} /> : answer.retrieval.evidence }}
                />
              </li>
            )}
            {answer.generated_by && (
              <li>
                <T k="answer.checked.model" values={{ model: answer.generated_by.model }} />
              </li>
            )}
          </ul>
          {answer.verification && answer.verification.issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.8125rem] leading-relaxed text-ink-muted">
              {answer.verification.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </DeeperPart>
      </div>
    </details>
  );
}

function DeeperPart({
  title,
  values,
  kind,
  children,
}: {
  title: MessageKey;
  values?: Record<string, ReactNode>;
  kind?: "ai";
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h4 className="display text-[1.625rem] leading-tight text-ink">
          <T k={title} values={values} />
        </h4>
        {kind === "ai" && <Label kind="ai" />}
      </div>
      {children}
    </section>
  );
}

function LimitedNote({ answer, passages }: { answer: Answer; passages: Map<string, PassageLink> }) {
  return (
    <div role="note" className="mt-8 flex gap-4 border-y border-rule py-5 text-[0.9375rem] leading-relaxed">
      <Icon name="info" className="mt-1 size-[1.125rem] text-ink-muted" />
      <div className="min-w-0">
        <p className="font-semibold text-ink">
          <T k="answer.limited.title" />
        </p>
        {answer.evidence_note && <CitedText text={answer.evidence_note} passages={passages} className="mt-1 text-ink-soft" />}
      </div>
    </div>
  );
}

type InterpretationField = "what_it_says" | "context" | "interpretation_notes" | "why_it_applies" | "application" | "limits";
type Row = { field: InterpretationField; title: MessageKey };

/** Shown with the passage: what it says, and why it speaks to the situation. */
const ESSENTIAL_ROWS: Row[] = [
  { field: "what_it_says", title: "interp.says" },
  { field: "why_it_applies", title: "interp.applies" },
];
/** Under "Go deeper": the rest of the model's reading of the passage. */
const DEEPER_ROWS: Row[] = [
  { field: "context", title: "interp.context" },
  { field: "interpretation_notes", title: "interp.notes" },
  { field: "application", title: "interp.apply" },
  { field: "limits", title: "interp.limits" },
];

/** What the model wrote about one passage, set beneath it and marked as its reading. */
function Interpretation({
  teaching,
  passages,
  rows,
  bare = false,
}: {
  teaching: Teaching;
  passages: Map<string, PassageLink>;
  rows: Row[];
  /** Without its own label and report link, inside a part that already carries them. */
  bare?: boolean;
}) {
  const shown = rows.filter((row) => teaching[row.field]);
  if (!shown.length) return null;
  return (
    <div className={bare ? "" : "-mt-4 border-l-2 border-ai/40 pb-6 pl-6"}>
      {!bare && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label kind="ai" />
          <span className="text-xs text-ink-muted">
            <T k="interp.byModel" />
          </span>
        </div>
      )}
      <dl className={bare ? "space-y-5" : "mt-5 space-y-5"}>
        {shown.map((row) => (
          <Fragment key={row.field}>
            <div>
              <dt className="text-[0.8125rem] font-semibold text-ai">
                <T k={row.title} />
              </dt>
              <dd className="mt-1">
                <CitedText text={teaching[row.field] as string} passages={passages} className={AI_SMALL} />
              </dd>
            </div>
          </Fragment>
        ))}
      </dl>
      {!bare && (
        <div className="mt-6">
          <FeedbackButton passageId={teaching.passage.id} variant="link" label="interp.report" />
        </div>
      )}
    </div>
  );
}

interface ChapterProps {
  id: string;
  title: MessageKey;
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
            <T k={title} />
          </h3>
          {kind === "ai" && <Label kind="ai" />}
        </div>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * The passages the answer rests on, a reminder of what is source and what is
 * interpretation, whether it is saved, and a way to report a problem. Before
 * the follow-up, so the answer ends on its sources.
 */
function AnswerSources({ answer, question }: { answer: Answer; question: string }) {
  const cited = uniquePassages(
    answer.kind === "retrieval_only"
      ? answer.passages
      : [...answer.teachings.map((t) => t.passage), ...answer.related.map((r) => r.passage)],
  );
  const retrievalOnly = answer.kind === "retrieval_only";
  return (
    <section
      id={`${answer.id}-sources`}
      aria-labelledby={`${answer.id}-sources-title`}
      className="mt-16 scroll-mt-36 border-t border-rule-strong"
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-3 border-b border-rule py-6 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <h3 id={`${answer.id}-sources-title`} className={panelHeading}>
          <T k={retrievalOnly ? "answer.sources.found" : "answer.sources"} />
        </h3>
        <div className="min-w-0">
          {cited.length > 0 && (
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
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            <T k={retrievalOnly ? "answer.checked.search" : "answer.disclaimer"} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <SavedStatus answer={answer} />
            <FeedbackButton answerId={answer.id} question={question} variant="toolbar" />
          </div>
        </div>
      </div>
    </section>
  );
}

function uniquePassages(list: Passage[]): Passage[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
