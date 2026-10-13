import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { Ornament } from "@/components/Ornament";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { VerseLines } from "@/components/VerseCard";
import { getChapter } from "@/lib/api";
import type { Chapter, Passage } from "@/lib/types";

type Props = PageProps<"/scripture/[source]/[chapter]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { source, chapter } = await props.params;
  const data = await getChapter(source, chapter);
  if (!data) return {};
  return {
    title: `${data.source.title}, ${data.source.division_label} ${data.chapter.number}`,
    description: `All ${data.chapter.passage_count} verses with Sanskrit, transliteration and translation.`,
  };
}

export default function ChapterPage(props: Props) {
  return (
    <PageContainer width="wide" className="pt-8 sm:pt-10">
      <Suspense fallback={<LoadingState variant="page" />}>
        <ChapterView params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

async function ChapterView({ params }: { params: Props["params"] }) {
  const { source, chapter } = await params;
  const data = await getChapter(source, chapter);
  if (!data) notFound();
  const { chapter: division } = data;
  const label = data.source.division_label;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Explore", href: "/explore" },
          { label: data.source.title, href: `/scripture/${data.source.id}` },
          { label: `${label} ${division.number}` },
        ]}
      />

      <ChapterStrip data={data} />

      <div className="mx-auto mt-14 max-w-reading">
        <div className="min-w-0">
          <header className="text-center">
            <p className="eyebrow text-accent">
              {label} {division.number}
            </p>
            <h1 className="display mt-4 text-[2.75rem] leading-[1.02] text-balance text-ink sm:text-title">
              {division.title ?? data.source.title}
            </h1>
            {division.title_original && (
              <p lang="sa" className="deva mt-2 text-xl text-ink-soft">
                {division.title_original}
              </p>
            )}
            <p className="mt-3 text-sm text-ink-muted">{division.passage_count} verses</p>
            <Ornament className="mx-auto mt-8 w-32 text-gold/70" />
          </header>

          <ol className="mt-4">
            {data.passages.map((passage, i) => (
              <VerseRow key={passage.id} passage={passage} showSpeaker={startsNewSpeech(passage, data.passages[i - 1])} />
            ))}
          </ol>

          <nav aria-label={`${label}s`} className="mt-10 grid gap-3 sm:grid-cols-2">
            {data.previous !== null ? (
              <Link
                href={`/scripture/${data.source.id}/${data.previous}`}
                className="group flex items-center gap-3 border-t border-rule py-4 transition-colors"
              >
                <Icon name="arrowLeft" className="size-4 text-ink-muted transition-transform group-hover:-translate-x-0.5" />
                <span className="text-sm">
                  <span className="block text-ink-muted">Previous</span>
                  <span className="display text-xl text-ink">
                    {label} {data.previous}
                  </span>
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {data.next !== null && (
              <Link
                href={`/scripture/${data.source.id}/${data.next}`}
                className="group flex items-center justify-end gap-3 border-t border-rule py-4 text-right transition-colors"
              >
                <span className="text-sm">
                  <span className="block text-ink-muted">Next</span>
                  <span className="display text-xl text-ink">
                    {label} {data.next}
                  </span>
                </span>
                <Icon name="arrowRight" className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}

/** Every chapter of the source as a compact strip, the current one marked. */
function ChapterStrip({ data }: { data: Chapter }) {
  const current = String(data.chapter.number);
  return (
    <nav aria-label={`${data.source.division_label}s of ${data.source.title}`} className="mt-6">
      <ol className="flex flex-wrap gap-1.5">
        {data.source.divisions.map((d) => {
          const active = String(d.number) === current;
          return (
            <li key={String(d.number)}>
              <Link
                href={`/scripture/${data.source.id}/${d.number}`}
                aria-current={active ? "page" : undefined}
                title={d.title ?? undefined}
                aria-label={`${data.source.division_label} ${d.number}${d.title ? `: ${d.title}` : ""}`}
                className={`flex size-10 items-center justify-center rounded-full font-serif text-base tabular-nums transition-colors ${
                  active
                    ? "bg-primary text-primary-ink"
                    : "text-ink-soft ring-1 ring-rule hover:bg-surface-raised hover:text-ink hover:ring-gold"
                }`}
              >
                {d.number}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function startsNewSpeech(passage: Passage, previous?: Passage): boolean {
  if (!previous) return true;
  const last = previous.speakers[previous.speakers.length - 1] ?? previous.speaker;
  return passage.speakers[0] !== last || passage.speakers.length > 1;
}

function VerseRow({ passage, showSpeaker }: { passage: Passage; showSpeaker: boolean }) {
  return (
    <li id={`v${passage.verse}`} className="reveal scroll-mt-24 border-b border-rule py-7 last:border-b-0">
      {showSpeaker && passage.speakers.length > 0 && (
        <p className="mb-4 text-center text-xs font-semibold tracking-[0.15em] text-ink-muted uppercase">
          {passage.speakers.join(" · then ")}
        </p>
      )}
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 sm:gap-x-5">
        <Link
          href={passage.path}
          className="pt-1 text-right font-serif text-sm text-accent tabular-nums hover:underline"
          aria-label={`${passage.ref}: context and details`}
        >
          {passage.chapter}.{passage.verse}
        </Link>
        <div className="min-w-0">
          {passage.sanskrit && (
            <p lang="sa" className="deva text-lg whitespace-pre-line text-ink [overflow-wrap:anywhere]">
              <VerseLines text={passage.sanskrit} />
            </p>
          )}
          <p className={`font-serif text-[1.0625rem] leading-relaxed text-pretty text-ink ${passage.sanskrit ? "mt-2.5" : ""}`}>
            {passage.translation}
          </p>
          {passage.provenance.status !== "verified" && (
            <p className="mt-2.5">
              <ProvenanceBadge provenance={passage.provenance} />
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
