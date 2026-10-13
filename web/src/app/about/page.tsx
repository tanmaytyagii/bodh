import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { Label } from "@/components/Label";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSources } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { panelHeading, textLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "About",
  description: `What ${BRAND.name} means, how its answers are made, where the texts come from, and what it is not.`,
};

const SECTIONS = [
  { id: "method", title: "How answers are made" },
  { id: "sources", title: "Sources and licences" },
  { id: "privacy", title: "Privacy" },
  { id: "limits", title: "What this is not" },
];

const STEPS: { title: string; text: ReactNode }[] = [
  {
    title: "Safety first",
    text: "Every question is checked for signs that someone may be at risk. If so, the reply leads with people who can help now, and verses about death or fighting are never offered.",
  },
  {
    title: "Understanding",
    text: "A language model restates your situation and the dilemma beneath it, and turns it into searches phrased the way the translation speaks (“fruit of action”, “wrath”, “balanced in success and failure”).",
  },
  {
    title: "Retrieval",
    text: "Hybrid search combines meaning-based search, word search, matching of romanized or Devanagari Sanskrit, and an editorial index of themes. Neighbouring verses come along as context.",
  },
  {
    title: "A grounded reply",
    text: "The model may cite only the passages it was given, by id. It never reproduces scripture: the verse text you see is loaded from the verified corpus, not written by the model.",
  },
  {
    title: "Verification",
    text: "Before display, any citation of a passage that was not provided is removed, and anything in quotation marks that does not appear word-for-word in the sources loses its quotation marks.",
  },
];

export default function AboutPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={`About ${BRAND.name}`}
        title="Wisdom that helps you judge for yourself"
        description={
          <>
            <p className="max-w-2xl">
              {BRAND.devanagari ? (
                <>
                  {BRAND.name} (<span lang="hi">{BRAND.devanagari}</span>) means understanding: awareness, discernment,
                  insight. It is a tool
                </>
              ) : (
                <>{BRAND.name} is a tool</>
              )}{" "}
              for thinking through real situations with the Bhagavad Gita and the Upanishads. Its guiding principle
              comes from the end of the Gita itself: after the whole teaching, Krishna tells Arjuna to reflect on it
              fully and then act as he chooses (
              <Link href="/scripture/bhagavad-gita/18/63" className={textLink}>
                18.63
              </Link>
              ). Wisdom should help you exercise better judgement — not hand your judgement to a machine.
            </p>
            {BRAND.hindi && (
              <p className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span lang="hi" className="font-deva text-[1.5rem] leading-normal text-ink">
                  {BRAND.hindi.text}
                </span>
                <span className="text-base text-ink-muted">
                  {BRAND.hindi.meaning} {BRAND.philosophy}
                </span>
              </p>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-x-16 gap-y-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <p className={panelHeading}>On this page</p>
          <ul className="mt-3 space-y-1 border-l border-rule">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px block border-l border-transparent py-1 pl-4 text-sm text-ink-muted transition-colors hover:border-accent hover:text-ink"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-reading min-w-0">
          <Section id="method" title="How answers are made" first>
            <ol className="divide-y divide-rule border-y border-rule">
              {STEPS.map((step, i) => (
                <li key={step.title} className="reveal grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-5">
                  <span aria-hidden className="font-serif text-[1.75rem] leading-none text-gold tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{step.title}</p>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <h3 className="mt-10 text-[0.9375rem] font-semibold text-ink">The kinds of content are always labelled</h3>
            <dl className="mt-3 divide-y divide-rule border-y border-rule">
              <KindRow label={<Label kind="source" />}>exactly as printed in the cited edition</KindRow>
              <KindRow label={<Label kind="note" />}>the translator’s own notes, as printed in the edition</KindRow>
              <KindRow label={<Label kind="editorial" />}>themes, stories and context notes curated for this project</KindRow>
              <KindRow label={<Label kind="ai" />}>written by a language model, which can be wrong</KindRow>
            </dl>
          </Section>

          <Section id="sources" title="Sources and licences">
            <Suspense fallback={<div aria-hidden className="skeleton h-64 rounded-2xl" />}>
              <SourcesTable />
            </Suspense>
            <div className="mt-8 space-y-4">
              <p>
                <strong className="text-ink">Independent check.</strong> The Sanskrit of every verse of the Gita is
                compared with a second digital edition (the open{" "}
                <a href="https://github.com/gita/gita" target="_blank" rel="noreferrer" className={textLink}>
                  gita/gita
                </a>{" "}
                dataset). 676 of 701 verses agree, allowing for spelling conventions; the other 25 are shown as printed
                and flagged “under review”, with the differing reading visible on the verse page. Transcribers’
                corrections of misprints are applied only where the second edition supports them, and every
                correction is recorded.
              </p>
              <p>
                <strong className="text-ink">The Upanishads</strong> come from an edition that does not print the
                Sanskrit, so those passages are marked “translation only”; the translator’s commentary on each verse is
                shown as his notes.
              </p>
              <p>
                <strong className="text-ink">Transliteration</strong> (IAST) is generated from the Devanagari, not typed
                by hand. <strong className="text-ink">Chapter titles</strong> come from the edition’s own colophons.
                This edition of the Gita counts 701 verses: it includes the opening verse of chapter 13 that some
                editions omit, so from 13.2 onwards its verse numbers are one higher than in those editions.
              </p>
            </div>
          </Section>

          <Section id="privacy" title="Privacy">
            <p>
              Your questions are not stored on the server and are not written to logs. A conversation lives in your
              browser tab and disappears when you close it. Saved reflections stay in your browser only. If you report
              an issue, your question is included only if you tick the box. Questions are sent to the language-model
              provider to generate the reply.
            </p>
            <p className="mt-4">
              You can review and delete what this browser keeps in{" "}
              <Link href="/settings" className={textLink}>
                Settings
              </Link>
              .
            </p>
          </Section>

          <Section id="limits" title="What this is not">
            <ul className="divide-y divide-rule border-y border-rule">
              {[
                `${BRAND.name} is not Krishna, a guru, or a religious authority, and its interpretations are not the only valid ones.`,
                "It is not a substitute for medical, mental-health, legal or financial help.",
                "The Gita has many traditions of commentary. This collection does not yet include traditional commentaries, so the replies do not speak for them.",
                "Retrieval is measured, not assumed: see the evaluation notes in the project documentation.",
              ].map((item) => (
                <li key={item} className="flex gap-3 py-3.5">
                  <span aria-hidden className="mt-[0.6rem] size-1.5 shrink-0 rotate-45 bg-ink-muted" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl bg-surface-sunk px-5 py-4">
              If you are struggling, in India you can call Tele-MANAS on <strong className="text-ink">14416</strong>{" "}
              (free, 24×7), or <strong className="text-ink">112</strong> in an emergency.
            </p>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

/** The editions behind each text, as served by the API. */
async function SourcesTable() {
  await connection();
  let sources;
  try {
    sources = (await getSources()) ?? [];
  } catch {
    return <p>The list of sources could not be loaded right now.</p>;
  }
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {sources.map((source) => {
        const edition = source.editions.find((e) => e.role === "primary");
        return (
          <li key={source.id} className="reveal grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div>
              <Link href={`/scripture/${source.id}`} className="display text-[1.375rem] leading-tight text-ink hover:underline">
                {source.title}
              </Link>
              <p className="mt-1 text-xs text-ink-muted">{source.passage_count} verses</p>
            </div>
            {edition && (
              <div className="min-w-0 text-[0.9375rem] leading-relaxed">
                <p className="text-ink">
                  {edition.title}
                  {edition.year ? ` (${edition.year})` : ""}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{edition.contributors}</p>
                <p className="mt-2 text-sm text-ink-soft">{edition.license}</p>
                <a
                  href={edition.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent"
                >
                  Source transcription ↗
                </a>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ id, title, first, children }: { id: string; title: string; first?: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 ${first ? "" : "mt-20 border-t border-rule pt-12"}`}
    >
      <h2 id={`${id}-title`} className="display text-[2.25rem] leading-tight text-ink">
        {title}
      </h2>
      <div className="mt-6 text-base leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function KindRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="text-[0.9375rem]">{children}</dd>
    </div>
  );
}
