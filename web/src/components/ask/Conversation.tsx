"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/Icon";
import { JourneyObserver } from "@/components/landing/JourneyObserver";
import { StoryRail } from "@/components/landing/StoryRail";
import { InstrumentFrame } from "@/components/scene/InstrumentFrame";
import { Stage } from "@/components/scene/Stage";
import { CONVERSATION_HASH, SHOW_INVITATION } from "@/lib/askNavigation";
import { BRAND } from "@/lib/brand";
import { historyFor, loadConversation, storeConversation, type Turn } from "@/lib/reflections";
import type { SceneMode } from "@/lib/scene";
import { AskError, askStream } from "@/lib/stream";
import type { Passage, Stage as AskStage } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

import { AnswerPanel } from "./AnswerPanel";
import { ExampleQuestions } from "./ExampleQuestions";
import { Progress } from "./Progress";
import { QuestionComposer } from "./QuestionComposer";

interface Pending {
  question: string;
  stage: AskStage | "sending";
  summary?: string;
  passages?: Passage[];
  /** Asked from the invitation: once answered, it begins a new conversation. */
  fresh: boolean;
}

type View = "invitation" | "conversation";

const STAGE_ANNOUNCEMENT: Record<string, string> = {
  understanding: "Understanding your situation…",
  retrieving: "Searching the texts…",
  writing: "Writing a grounded reply…",
};

/**
 * The conversation's reading column (46rem). Below 1280px the instrument sits
 * above the question, so the column leaves room for it (conversationFraming
 * in lib/scene.ts); from 1280px it rests in the margin beside the column.
 */
const COLUMN =
  "relative z-10 mx-auto w-full max-w-[46rem] px-5 pt-[calc(min(30vw,16lvh,170px)+1.5rem)] pb-24 sm:px-8 xl:px-0 xl:pt-12";

/**
 * The Ask page, in two views at one address.
 *
 * The invitation (no active question): the headline and the question box
 * over the 3D instrument, a few example questions, and the landing story
 * below (`below`). A conversation from earlier in this tab is never shown
 * here, but it is offered: one link takes you back to it.
 *
 * The conversation (#conversation): each question with its answer in a
 * reading column, the follow-up box after the latest answer, and the
 * instrument quietly beside it. Refresh, back and forward keep the view;
 * links to Ask bring back the invitation.
 */
export function Conversation({ below }: { below?: ReactNode }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [view, setView] = useState<View>("invitation");
  const [draft, setDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState("");
  // An error belongs to the box it came from: the invitation's, or the follow-up's.
  const [error, setError] = useState<{ view: View; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
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

  // Restore this tab's conversation, before the first paint so a refresh
  // never flashes the invitation. It is shown only when the address asks for
  // it (a refresh, or back/forward); otherwise the invitation offers it.
  // This also runs each time the page is shown again: Next.js keeps it, state
  // and all, while another page is open, so a link back to Ask must bring the
  // invitation here, as it does on the page itself.
  useLayoutEffect(() => {
    const restored = loadConversation();
    const asked = window.location.hash === CONVERSATION_HASH;
    if (asked && !restored.length) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the view follows the address whenever the page is shown
    if (!asked) setView("invitation");
    if (!restored.length) return;
    setTurns(restored);
    if (asked) setView("conversation");
  }, []);

  // Keep it as soon as it changes, so a refresh straight after an answer keeps
  // it too. Only "Start over" clears it, so nothing here can erase a
  // conversation before it has been restored.
  useLayoutEffect(() => {
    if (turns.length) storeConversation(turns);
  }, [turns]);

  // Back and forward move between the two views; a link to Ask from the
  // conversation brings back the invitation.
  useEffect(() => {
    const onPopState = () => setView(window.location.hash === CONVERSATION_HASH ? "conversation" : "invitation");
    const onShowInvitation = () => {
      setError(null);
      setView("invitation");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener(SHOW_INVITATION, onShowInvitation);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(SHOW_INVITATION, onShowInvitation);
    };
  }, []);

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
    let pushed = false;
    setError(null);
    setAnnouncement("Sending your question…");
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
            setAnnouncement(STAGE_ANNOUNCEMENT[stage] ?? "");
          },
          onUnderstanding: (u) => setPending((p) => (p ? { ...p, summary: u.summary } : p)),
          onPassages: (passages) => setPending((p) => (p ? { ...p, passages } : p)),
          onAnswer: (answer) => {
            setTurns((t) => (fresh ? [{ question: text, answer }] : [...t, { question: text, answer }]));
            setPending(null);
            setAnnouncement("Your answer is ready.");
          },
        },
        abort.current.signal,
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
        setAnnouncement("Stopped. Your question is back in the box.");
        return;
      }
      setError({
        view: fresh ? "invitation" : "conversation",
        message: err instanceof AskError ? err.message : "Something went wrong. Please try again.",
      });
      setAnnouncement("The question could not be answered.");
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
    setFollowUpDraft("");
    setView("invitation");
    setAnnouncement("Started a new conversation.");
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

  const followUpSection = (
    <section aria-label="Continue the conversation" id="follow-up" className="scroll-mt-28">
      {suggestions.length > 0 && (
        <div className="mb-6">
          <p className="eyebrow text-ink-muted">Continue the conversation</p>
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
        error={error?.view === "conversation" ? error.message : null}
        onRetry={() => void ask(followUpDraft)}
        inputRef={followUpRef}
      />
    </section>
  );

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
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
                      Bhagavad Gita · Upanishads
                    </p>
                    <h1
                      id="hero-title"
                      className="display mt-(--hero-gap-xs) text-[clamp(2.75rem,7.2vw,6.25rem)] leading-[0.95] text-balance text-ink hero-split:text-[clamp(2.75rem,min(16.5cqi,11svh),10rem)]"
                    >
                      <span className="block">Ancient wisdom.</span>{" "}
                      <span className="block">
                        Your life, <em className="text-accent">today.</em>
                      </span>
                    </h1>
                    <p className="mt-(--hero-gap-sm) max-w-[30em] text-[1.0625em] leading-relaxed text-pretty text-ink-soft sm:text-[1.125em]">
                      Bring the questions life leaves you with. {BRAND.name} helps you explore what ancient teachings
                      can offer, examine the original sources, and find room to think.
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
                      error={error?.view === "invitation" ? error.message : null}
                      onRetry={() => void ask(draft)}
                      inputRef={inputRef}
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
                          Return to your conversation
                        </button>
                        {pending ? " — your question is still being answered." : "."}{" "}
                        <span className="text-ink-muted">A new question here starts a new one.</span>
                      </span>
                    </p>
                  )}
                  <div className="mt-(--hero-gap) max-w-[46em]">
                    <ExampleQuestions
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
              className="relative z-10 mx-auto mb-6 hidden items-center gap-2 rounded-full px-4 py-2 text-xs font-medium tracking-wide text-ink-muted transition-colors hover:text-ink [@media(min-height:760px)]:flex"
            >
              <Icon name="chevronDown" className="size-4" />
              Scroll to explore
            </a>
          </section>
          {below}
          <JourneyObserver />
          <StoryRail />
        </>
      ) : (
        <div className={COLUMN}>
          <h1 className="sr-only">Your conversation</h1>
          {visibleTurns.map((turn, i) => {
            const isLatest = !pending && i === visibleTurns.length - 1;
            return (
              <article
                key={turn.answer.id}
                ref={isLatest ? latestRef : undefined}
                aria-label={`Question ${i + 1}`}
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
                        New question
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
              aria-label="Current question"
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
                    <span className="font-medium text-ink">As understood: </span>
                    {pending.summary}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-ink-muted">
                    {pending.passages && pending.passages.length > 0
                      ? `Reading ${pending.passages.map((p) => p.short_ref).join(", ")}`
                      : "This takes a few seconds."}
                  </p>
                  <button type="button" onClick={stop} className={buttonClass("secondary", "sm")}>
                    <Icon name="stop" className="size-4" />
                    Stop
                  </button>
                </div>
              </div>
              <div aria-hidden className="rise mt-10 space-y-3">
                <div className="skeleton h-4 w-1/4" />
                <div className="skeleton h-8 w-2/5" />
                <div className="skeleton mt-6 h-5 w-full" />
                <div className="skeleton h-5 w-11/12" />
                <div className="skeleton h-5 w-4/5" />
                <div className="skeleton h-5 w-3/5" />
              </div>
            </article>
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
          {followUp ? "You followed up" : "You asked"}
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
