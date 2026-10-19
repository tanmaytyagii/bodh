"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { Both, T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { JourneyObserver } from "@/components/landing/JourneyObserver";
import { StoryRail } from "@/components/landing/StoryRail";
import { InstrumentFrame } from "@/components/scene/InstrumentFrame";
import { Stage } from "@/components/scene/Stage";
import { VerseCard } from "@/components/VerseCard";
import { CONVERSATION_HASH, SHOW_INVITATION } from "@/lib/askNavigation";
import { ASK_PREFILL_EVENT, readPrefill, type AskPrefill } from "@/lib/askPrefill";
import { BRAND } from "@/lib/brand";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";
import { historyFor, loadConversation, storeConversation, type Turn } from "@/lib/reflections";
import type { SceneMode } from "@/lib/scene";
import { AskError, askStream } from "@/lib/stream";
import type { Passage, Stage as AskStage } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

import { AnswerPanel } from "./AnswerPanel";
import { ExampleQuestions } from "./ExampleQuestions";
import { FollowUpDock } from "./FollowUpDock";
import { Progress } from "./Progress";
import { MAX_QUESTION_CHARS, QuestionComposer } from "./QuestionComposer";

interface Pending {
  question: string;
  stage: AskStage | "sending";
  summary?: string;
  passages?: Passage[];
  /** Asked from the invitation: once answered, it begins a new conversation. */
  fresh: boolean;
}

type View = "invitation" | "conversation";

/** What a question from the invitation is about ("Ask about this"): shown by the box, sent with the question. */
interface About {
  label: string;
  passageIds: string[];
}

/** Why the last question could not be answered: an interface message, or the server's own words. */
interface ErrorState {
  view: View;
  key?: MessageKey;
  values?: Record<string, string | number>;
  text?: string;
}

const STAGE_ANNOUNCEMENT: Record<string, MessageKey> = {
  understanding: "announce.understanding",
  retrieving: "announce.retrieving",
  writing: "announce.writing",
};

/**
 * The conversation's reading column (46rem). Below 1280px a small instrument
 * sits above the question, so the column leaves room for it
 * (conversationFraming in lib/scene.ts); from 1280px it rests in the margin
 * beside the column.
 */
const COLUMN =
  "relative z-10 mx-auto w-full max-w-[46rem] px-5 pt-[calc(min(20vw,10lvh,96px)+1.5rem)] pb-24 sm:px-8 xl:px-0 xl:pt-12";

/**
 * The Ask page, in two views at one address.
 *
 * The invitation (no active question): the headline and the question box
 * over the 3D instrument, a few example questions, and the landing story
 * below (`below`). A conversation from earlier in this tab is never shown
 * here, but it is offered: one link takes you back to it. "Ask about this"
 * elsewhere fills its question box (see lib/askPrefill.ts).
 *
 * The conversation (#conversation): each question with its answer in a
 * reading column, the follow-up box after the latest answer, and the
 * instrument quietly beside it. While an answer is being written, the
 * passages it will rest on are already there to read. Refresh, back and
 * forward keep the view; links to Ask bring back the invitation.
 */
export function Conversation({ below }: { below?: ReactNode }) {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [view, setView] = useState<View>("invitation");
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState<About | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState("");
  // An error belongs to the box it came from: the invitation's, or the follow-up's.
  const [error, setError] = useState<ErrorState | null>(null);
  const [announcement, setAnnouncement] = useState<MessageKey | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Why the request was cancelled: "stop" keeps the question for editing.
  const cancelled = useRef<"stop" | "reset" | null>(null);
  // Set while a question is being sent, so a double press cannot send it twice.
  const sending = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  // Where the question box was when a first question was sent, so the new
  // heading can glide up from it.
  const composerRef = useRef<HTMLDivElement>(null);
  const glideFrom = useRef<DOMRect | null>(null);
  const pendingHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstHeadingRef = useRef<HTMLHeadingElement>(null);
  const latestRef = useRef<HTMLElement>(null);

  /** "Ask about this": the invitation, its box filled and ready to finish; nothing is sent. */
  const applyPrefill = useCallback((prefill: AskPrefill) => {
    setError(null);
    setDraft(prefill.question.slice(0, MAX_QUESTION_CHARS));
    setAbout(
      prefill.about || prefill.passageIds.length
        ? { label: prefill.about ?? prefill.passageIds.join(", "), passageIds: prefill.passageIds }
        : null,
    );
    setView("invitation");
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }, []);

  // Restore this tab's conversation, before the first paint so a refresh
  // never flashes the invitation. It is shown only when the address asks for
  // it (a refresh, or back/forward); otherwise the invitation offers it.
  // This also runs each time the page is shown again: Next.js keeps it, state
  // and all, while another page is open, so a link back to Ask must bring the
  // invitation here, as it does on the page itself. An address carrying an
  // "Ask about this" prefill fills the box, and is then cleared.
  useLayoutEffect(() => {
    const restored = loadConversation();
    const prefill = readPrefill(window.location.search);
    if (prefill) window.history.replaceState(null, "", window.location.pathname);
    const asked = !prefill && window.location.hash === CONVERSATION_HASH;
    if (asked && !restored.length) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the view follows the address whenever the page is shown
    if (!asked) setView("invitation");
    if (restored.length) {
      setTurns(restored);
      if (asked) setView("conversation");
    }
    if (prefill) applyPrefill(prefill);
  }, [applyPrefill]);

  // Keep it as soon as it changes, so a refresh straight after an answer keeps
  // it too. Only "Start over" clears it, so nothing here can erase a
  // conversation before it has been restored.
  useLayoutEffect(() => {
    if (turns.length) storeConversation(turns);
  }, [turns]);

  // Back and forward move between the two views; a link to Ask from the
  // conversation brings back the invitation; "Ask about this" on this page fills it.
  useEffect(() => {
    const onPopState = () => setView(window.location.hash === CONVERSATION_HASH ? "conversation" : "invitation");
    const onShowInvitation = () => {
      setError(null);
      setView("invitation");
      window.scrollTo({ top: 0 });
    };
    const onPrefill = (event: Event) => {
      if (window.location.hash) window.history.pushState(null, "", window.location.pathname);
      applyPrefill((event as CustomEvent<AskPrefill>).detail);
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener(SHOW_INVITATION, onShowInvitation);
    window.addEventListener(ASK_PREFILL_EVENT, onPrefill);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(SHOW_INVITATION, onShowInvitation);
      window.removeEventListener(ASK_PREFILL_EVENT, onPrefill);
    };
  }, [applyPrefill]);

  const hasConversation = turns.length > 0 || pending !== null;
  const showConversation = view === "conversation" && hasConversation;
  // A new question from the invitation replaces the conversation only once it is answered.
  const visibleTurns = pending?.fresh ? [] : turns;

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending || sending.current) return;
    sending.current = true;
    const fresh = !showConversation;
    const history = fresh ? [] : historyFor(turns);
    const passageIds = fresh ? (about?.passageIds ?? []) : [];
    let pushed = false;
    setError(null);
    setAnnouncement("announce.sending");
    abort.current = new AbortController();
    cancelled.current = null;
    try {
      if (fresh) {
        if (window.location.hash !== CONVERSATION_HASH) {
          window.history.pushState(null, "", CONVERSATION_HASH);
          pushed = true;
        }
        glideFrom.current = composerRef.current?.getBoundingClientRect() ?? null;
        setDraft("");
        setPending({ question: text, stage: "sending", fresh: true });
        setView("conversation");
      } else {
        setFollowUpDraft("");
        setPending({ question: text, stage: "sending", fresh: false });
      }
      await askStream(
        text,
        history,
        {
          onStage: (stage) => {
            setPending((p) => (p ? { ...p, stage } : p));
            setAnnouncement(STAGE_ANNOUNCEMENT[stage] ?? null);
          },
          onUnderstanding: (u) => setPending((p) => (p ? { ...p, summary: u.summary } : p)),
          onPassages: (passages) => setPending((p) => (p ? { ...p, passages } : p)),
          onAnswer: (answer) => {
            setTurns((t) => (fresh ? [{ question: text, answer }] : [...t, { question: text, answer }]));
            setPending(null);
            if (fresh) setAbout(null);
            setAnnouncement("announce.ready");
          },
        },
        abort.current.signal,
        passageIds,
      );
    } catch (err) {
      setPending(null);
      const stopped = (err as Error).name === "AbortError";
      if (stopped && cancelled.current === "reset") return;
      // The question goes back in its box, ready to send again.
      if (fresh) {
        setDraft(text);
        returnToInvitation(pushed);
      } else {
        setFollowUpDraft(text);
      }
      if (stopped) {
        setAnnouncement("announce.stopped");
        return;
      }
      const where: View = fresh ? "invitation" : "conversation";
      setError(
        err instanceof AskError
          ? err.key
            ? { view: where, key: err.key, values: err.values }
            : { view: where, text: err.message }
          : { view: where, key: "error.generic" },
      );
      setAnnouncement("announce.failed");
    } finally {
      abort.current = null;
      sending.current = false;
    }
  }

  // As a first question is sent, the page becomes the conversation and the
  // question becomes its heading, gliding up from where the question box was.
  // Only transform and opacity move, so nothing waits on it and every control
  // stays usable throughout; with reduced motion it simply appears. Focus
  // moves to the heading, since the button that sent the question is gone.
  useLayoutEffect(() => {
    const from = glideFrom.current;
    glideFrom.current = null;
    const heading = pendingHeadingRef.current;
    if (!from || !heading || !pending?.fresh) return;
    window.scrollTo({ top: 0 });
    heading.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = heading.getBoundingClientRect();
    heading.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`, opacity: 0.3 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [pending?.question, pending?.fresh]);

  /** After a first question that was not answered: back to the invitation, and any earlier conversation. */
  function returnToInvitation(pushed: boolean) {
    setView("invitation");
    if (window.location.hash === CONVERSATION_HASH) {
      if (pushed) window.history.back();
      else window.history.replaceState(null, "", window.location.pathname);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Bring a follow-up (and then its answer) into view. The first question is
  // already at the top of the page.
  useEffect(() => {
    const element = latestRef.current;
    if (element?.previousElementSibling?.tagName === "ARTICLE") {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [turns.length, pending?.question]);

  function stop() {
    cancelled.current = "stop";
    abort.current?.abort();
  }

  function startOver() {
    cancelled.current = "reset";
    abort.current?.abort();
    storeConversation([]);
    setTurns([]);
    setPending(null);
    setError(null);
    setDraft("");
    setAbout(null);
    setFollowUpDraft("");
    setView("invitation");
    setAnnouncement("announce.startOver");
    if (window.location.hash === CONVERSATION_HASH) window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      inputRef.current?.focus();
    });
  }

  /** The invitation, keeping the conversation one step back in history. */
  function showInvitation() {
    window.history.pushState(null, "", window.location.pathname);
    setError(null);
    setView("invitation");
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function showConversationAgain() {
    if (window.location.hash !== CONVERSATION_HASH) window.history.pushState(null, "", CONVERSATION_HASH);
    setError(null);
    setView("conversation");
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => firstHeadingRef.current?.focus({ preventScroll: true }));
  }

  const latest = visibleTurns[visibleTurns.length - 1];
  const suggestions = !pending && latest ? latest.answer.suggested_follow_ups : [];
  const sceneMode: SceneMode = !showConversation ? "hero" : pending ? "thinking" : "reading";
  // A reply to someone who may be at risk is no place for decoration.
  const sceneQuiet = showConversation && !pending && latest?.answer.kind === "crisis";
  const errorFor = (where: View): ReactNode =>
    error?.view === where ? error.key ? <T k={error.key} values={error.values} /> : error.text : null;

  const followUpSection = (
    <section aria-label={t("conversation.continue")} id="follow-up" className="scroll-mt-28">
      {suggestions.length > 0 && (
        <div className="mb-6">
          <p className="eyebrow text-ink-muted">
            <T k="conversation.continue" />
          </p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {suggestions.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => void ask(q)}
                  className="group flex w-full items-center gap-3 py-3.5 text-left text-[0.9375rem] text-ink-soft transition-colors hover:text-ink"
                >
                  <Icon name="reply" className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">{q}</span>
                  <Icon name="arrowRight" className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <QuestionComposer
        variant="follow-up"
        value={followUpDraft}
        onChange={setFollowUpDraft}
        onSubmit={() => void ask(followUpDraft)}
        onStop={stop}
        onStartOver={startOver}
        pending={false}
        error={errorFor("conversation")}
        onRetry={() => void ask(followUpDraft)}
        inputRef={followUpRef}
      />
    </section>
  );

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement && <T k={announcement} />}
      </p>
      <Stage mode={sceneMode} quiet={sceneQuiet} story={!showConversation} />

      {!showConversation ? (
        <>
          <section
            id="invitation"
            aria-labelledby="hero-title"
            className="relative z-10 -mt-[calc(4rem+env(safe-area-inset-top))] flex min-h-svh flex-col overflow-x-clip"
          >
            <div className="hero">
              <div className="hero-copy">
                <div className="hero-text">
                  <div className="hero-recede">
                    <p className="eyebrow flex items-center gap-3 text-accent">
                      <span aria-hidden className="h-px w-8 bg-accent" />
                      <T k="hero.eyebrow" />
                    </p>
                    <h1
                      id="hero-title"
                      className="display mt-(--hero-gap-xs) text-[clamp(2.75rem,7.2vw,6.25rem)] leading-[0.95] text-balance text-ink hero-split:text-[clamp(2.75rem,min(16.5cqi,11svh),10rem)]"
                    >
                      <Both
                        en={
                          <>
                            <span className="block">Ancient wisdom.</span>{" "}
                            <span className="block">
                              Your life, <em className="text-accent">today.</em>
                            </span>
                          </>
                        }
                        hi={
                          // Devanagari sets wider: never larger than lets each half fit its line (about 7.7em wide).
                          <span className="block text-[min(1em,12cqi)] leading-[1.25]">
                            <span className="block">प्राचीन ज्ञान।</span>{" "}
                            <span className="block">
                              आपका जीवन, <em className="text-accent not-italic">आज।</em>
                            </span>
                          </span>
                        }
                      />
                    </h1>
                    <p className="mt-(--hero-gap-sm) max-w-[30em] text-[1.0625em] leading-relaxed text-pretty text-ink-soft sm:text-[1.125em]">
                      <T k="hero.lede" values={{ name: BRAND.name }} />
                    </p>
                  </div>
                  <div ref={composerRef} className="mt-(--hero-gap) max-w-[46em]">
                    <QuestionComposer
                      variant="initial"
                      value={draft}
                      onChange={setDraft}
                      onSubmit={() => void ask(draft)}
                      onStop={stop}
                      pending={pending !== null}
                      error={errorFor("invitation")}
                      onRetry={() => void ask(draft)}
                      inputRef={inputRef}
                      about={about && { label: about.label, onClear: () => setAbout(null) }}
                    />
                  </div>
                  {hasConversation && (
                    <p className="mt-4 flex max-w-[46em] items-start gap-2.5 text-[0.875em] leading-relaxed text-ink-soft">
                      <Icon name="reply" className="mt-0.5 size-4 shrink-0 -scale-x-100 text-ink-muted" />
                      <span>
                        <button
                          type="button"
                          onClick={showConversationAgain}
                          className="font-medium text-ink underline decoration-rule-strong underline-offset-[3px] transition-colors hover:decoration-accent"
                        >
                          <T k="conversation.return" />
                        </button>
                        {pending ? (
                          <>
                            {" "}
                            <T k="conversation.return.pending" />
                          </>
                        ) : (
                          "."
                        )}{" "}
                        <span className="text-ink-muted">
                          <T k="conversation.return.note" />
                        </span>
                      </span>
                    </p>
                  )}
                  <div className="mt-(--hero-gap) max-w-[46em]">
                    <ExampleQuestions
                      value={draft}
                      onPick={(text) => {
                        setDraft(text);
                        inputRef.current?.focus();
                      }}
                    />
                  </div>
                </div>
              </div>
              <InstrumentFrame />
            </div>
            <a
              href="#teachings"
              className="scroll-cue relative z-10 mx-auto mb-6 hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-medium tracking-wide text-ink-muted transition-colors hover:text-ink [@media(min-height:760px)]:flex"
            >
              <Icon name="chevronDown" className="size-4" />
              <T k="hero.scroll" />
            </a>
          </section>
          {below}
          <JourneyObserver />
          <StoryRail />
        </>
      ) : (
        <div className={COLUMN}>
          <h1 className="sr-only">
            <T k="conversation.title" />
          </h1>
          {visibleTurns.map((turn, i) => {
            const isLatest = !pending && i === visibleTurns.length - 1;
            return (
              <article
                key={turn.answer.id}
                ref={isLatest ? latestRef : undefined}
                aria-label={t("conversation.question", { n: i + 1 })}
                className="rise scroll-mt-20 pb-20 [view-timeline-name:--answer] not-first-of-type:border-t not-first-of-type:border-rule not-first-of-type:pt-16"
              >
                <QuestionHeading
                  text={turn.question}
                  followUp={i > 0}
                  headingRef={i === 0 ? firstHeadingRef : undefined}
                  action={
                    i === 0 ? (
                      <button type="button" onClick={showInvitation} className={buttonClass("ghost", "sm")}>
                        <Icon name="plus" className="size-4" />
                        <T k="conversation.new" />
                      </button>
                    ) : undefined
                  }
                />
                <AnswerPanel question={turn.question} answer={turn.answer} followUp={isLatest ? followUpSection : undefined} />
              </article>
            );
          })}
          {pending && (
            <article
              ref={latestRef}
              aria-label={t("conversation.current")}
              aria-busy="true"
              className="scroll-mt-20 pb-20 not-first-of-type:border-t not-first-of-type:border-rule not-first-of-type:pt-16"
            >
              <QuestionHeading
                text={pending.question}
                followUp={!pending.fresh && turns.length > 0}
                headingRef={pendingHeadingRef}
              />
              <div className="rise border-y border-rule py-6">
                <Progress stage={pending.stage} passagesFound={pending.passages?.length} />
                {pending.summary && (
                  <p className="mt-6 text-[1.0625rem] leading-relaxed text-ink-soft">
                    <span className="font-medium text-ink">
                      <T k="pending.understood" />{" "}
                    </span>
                    {pending.summary}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-muted">
                    {pending.passages && pending.passages.length > 0 ? (
                      <T k="pending.reading" values={{ refs: pending.passages.map((p) => p.short_ref).join(", ") }} />
                    ) : (
                      <T k="pending.wait" />
                    )}
                  </p>
                  <button type="button" onClick={stop} className={buttonClass("secondary", "sm")}>
                    <Icon name="stop" className="size-4" />
                    <T k="composer.stop" />
                  </button>
                </div>
              </div>
              {/* Where "In short" will be, once it is written. */}
              <div aria-hidden className="rise mt-10 space-y-3">
                <div className="skeleton h-4 w-1/4" />
                <div className="skeleton mt-4 h-6 w-full" />
                <div className="skeleton h-6 w-11/12" />
                <div className="skeleton h-6 w-3/5" />
              </div>
              {pending.passages && pending.passages.length > 0 && (
                <section aria-labelledby="pending-passages-title" className="rise mt-14">
                  <h3 id="pending-passages-title" className="eyebrow text-ink-muted">
                    <T
                      k={pending.passages.length === 1 ? "answer.found.one" : "answer.found.other"}
                      values={{ count: pending.passages.length }}
                    />
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
                    <T k={pending.stage === "writing" ? "pending.writing" : "pending.found"} />
                  </p>
                  <ol className="mt-5">
                    {pending.passages.map((p) => (
                      <li key={p.id}>
                        <VerseCard passage={p} variant="reading" headingLevel={4} actions={false} />
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </article>
          )}
          {latest && !pending && latest.answer.kind !== "crisis" && (
            <FollowUpDock targetId="follow-up" inputRef={followUpRef} />
          )}
        </div>
      )}
    </>
  );
}

function QuestionHeading({
  text,
  followUp,
  headingRef,
  action,
}: {
  text: string;
  followUp: boolean;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  action?: ReactNode;
}) {
  return (
    <header className="mb-10">
      <div className="flex min-h-9 items-center justify-between gap-4">
        <p className="eyebrow flex items-center gap-3 text-accent">
          <span aria-hidden className="h-px w-8 bg-accent" />
          <T k={followUp ? "conversation.followedUp" : "conversation.asked"} />
        </p>
        {action}
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="display mt-4 text-[clamp(1.875rem,3.3vw,2.75rem)] leading-[1.12] text-pretty whitespace-pre-line text-ink"
      >
        “{text}”
      </h2>
    </header>
  );
}
