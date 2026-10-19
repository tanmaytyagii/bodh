import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { EmptyState } from "@/components/layout/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { Stage } from "@/components/scene/Stage";
import { SearchForm } from "@/components/SearchForm";
import { SourceSummary } from "@/components/SourceSummary";
import { VerseCard } from "@/components/VerseCard";
import { getSources, getStories, search } from "@/lib/api";
import { divisionKey } from "@/lib/passages";
import { buttonClass } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Explore the texts",
  description:
    "Browse and search the Bhagavad Gita and the Upanishads: Sanskrit, transliteration and public-domain translations.",
};

// With a search, the introduction steps back (group-has-[#results]) so the results start in the first screen.
const FRAME = "group/explore relative z-10 mx-auto w-full max-w-[96rem] px-(--page-x)";
const SUGGESTIONS = ["fear of failure", "lamp in a windless place", "karmanye vadhikaraste"];

type SearchParams = PageProps<"/explore">["searchParams"];

export default function ExplorePage(props: PageProps<"/explore">) {
  return (
    <>
      <Stage mode="ambient" />
      <div className={FRAME}>
        <section
          aria-labelledby="explore-title"
          className="pt-12 pb-14 sm:pt-20 sm:pb-16 lg:pt-24 lg:pb-24 group-has-[#results]/explore:pt-6 group-has-[#results]/explore:pb-10 sm:group-has-[#results]/explore:pt-10 lg:group-has-[#results]/explore:pb-12"
        >
          <div className="max-w-2xl short-landscape:max-w-[min(42rem,58vw)]">
            <p className="eyebrow flex items-center gap-3 text-accent">
              <span aria-hidden className="h-px w-8 bg-accent" />
              <T k="explore.eyebrow" />
            </p>
            <h1
              id="explore-title"
              className="display mt-5 text-[clamp(2.75rem,6.5vw,5.75rem)] leading-[0.95] text-ink group-has-[#results]/explore:mt-3 group-has-[#results]/explore:text-[clamp(2.25rem,4vw,3.5rem)]"
            >
              <T k="explore.title" />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-ink-soft group-has-[#results]/explore:hidden">
              <T k="explore.lede" />
            </p>
            <div className="mt-9 group-has-[#results]/explore:mt-6">
              <Suspense fallback={<SearchForm />}>
                <SearchFormWithQuery searchParams={props.searchParams} />
              </Suspense>
              {/* On phones, with results to read, the suggestions make way for them. */}
              <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 pl-1 text-sm text-ink-muted max-sm:group-has-[#results]/explore:hidden">
                <span>
                  <T k="explore.try" />
                </span>
                {SUGGESTIONS.map((s) => (
                  <Link
                    key={s}
                    href={`/explore?q=${encodeURIComponent(s)}`}
                    className="rounded-full bg-surface-raised/70 px-3.5 py-2 text-ink-soft ring-1 ring-rule backdrop-blur-sm transition-colors hover:text-ink hover:ring-gold"
                  >
                    {s}
                  </Link>
                ))}
              </p>
            </div>
          </div>
        </section>

        {/* No placeholder: most visits have no query, and a skeleton would only shift the page. */}
        <Suspense fallback={null}>
          <SearchResults searchParams={props.searchParams} />
        </Suspense>

        <Suspense fallback={<LoadingState label={<T k="explore.loading" />} variant="cards" />}>
          <Library />
        </Suspense>

        <Suspense fallback={null}>
          <Stories />
        </Suspense>

        <section aria-labelledby="themes-teaser" className="mt-28 border-t border-rule pt-14">
          <div className="grid grid-cols-1 items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <Label kind="editorial">
                <T k="explore.index" />
              </Label>
              <h2 id="themes-teaser" className="display mt-3 text-[clamp(2.25rem,4vw,3.25rem)] leading-tight text-ink">
                <T k="explore.situation.title" />
              </h2>
              <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
                <T k="explore.situation.body" />
              </p>
            </div>
            <Link href="/concepts" className={buttonClass("secondary", "lg")}>
              <T k="explore.browseThemes" />
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

async function SearchFormWithQuery({ searchParams }: { searchParams: SearchParams }) {
  const q = (await searchParams).q;
  return <SearchForm defaultValue={typeof q === "string" ? q : ""} />;
}

async function SearchResults({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim() : "";
  if (!q) return null;
  const results = await search(q, 10);
  if (!results) return null;
  return (
    <section aria-labelledby="results" className="mb-28 rounded-[2rem] bg-paper/90 px-5 py-8 ring-1 ring-rule backdrop-blur-xl sm:px-10 sm:py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="results" className="display text-[clamp(2rem,3.4vw,2.75rem)] leading-tight text-ink">
          <T k="explore.results" values={{ q }} />
        </h2>
        <span className="text-sm text-ink-muted">
          <T k={results.results.length === 1 ? "explore.count.one" : "explore.count.other"} values={{ count: results.results.length }} />
        </span>
      </div>
      {(results.concepts.length > 0 || results.evidence === "weak") && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {results.concepts.length > 0 && (
            <>
              <Label kind="editorial">
                <T k="explore.matchingThemes" />
              </Label>
              {results.concepts.map((c) => (
                <Link
                  key={c.id}
                  href={`/concepts/${c.id}`}
                  className="rounded-full bg-editorial-bg px-3.5 py-1.5 text-sm font-medium text-ink ring-1 ring-rule transition-colors hover:ring-editorial"
                >
                  {c.name}
                </Link>
              ))}
            </>
          )}
          {results.evidence === "weak" && (
            <p className="flex w-full items-center gap-2 pt-2 text-sm text-ink-soft">
              <Icon name="info" className="size-4 text-info" />
              <T k="explore.weak" />
            </p>
          )}
        </div>
      )}
      {results.results.length ? (
        <div className="mt-6 grid grid-cols-1 gap-x-14 xl:grid-cols-2">
          {results.results.map((hit) => (
            <div key={hit.passage.id} className="border-t border-rule">
              <VerseCard passage={hit.passage} variant="plain" compact />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState icon="search" title={<T k="explore.none.title" />}>
            <T k="explore.none.body" />
          </EmptyState>
        </div>
      )}
    </section>
  );
}

async function Library() {
  await connection();
  const sources = (await getSources()) ?? [];
  const gita = sources.find((s) => s.id === "bhagavad-gita");
  return (
    <section aria-labelledby="library" className="scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="library" className="display text-[clamp(2.25rem,4vw,3.25rem)] leading-tight text-ink">
          <T k="explore.library" />
        </h2>
        <span className="text-sm text-ink-muted">
          <T k="explore.texts" values={{ count: sources.length }} />
        </span>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1.45fr_1fr_1fr_1fr]">
        {sources.map((source, i) => (
          <li key={source.id} className="reveal">
            <Link
              href={`/scripture/${source.id}`}
              className="volume group relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-[2rem] bg-surface/85 p-7 ring-1 ring-rule backdrop-blur-md hover:ring-gold focus-visible:ring-gold sm:p-8"
            >
              <span aria-hidden className="pointer-events-none absolute inset-2 rounded-[1.6rem] border border-gold/15" />
              <span className="relative block font-serif text-sm text-accent tabular-nums">0{i + 1}</span>
              {source.title_original && (
                <span lang="sa" className="deva relative mt-4 block text-[1.75rem] leading-snug text-gold">
                  {source.title_original}
                </span>
              )}
              <span className={`display relative block leading-[1] text-ink ${source.title_original ? "mt-1" : "mt-4"} ${i === 0 ? "text-[2.75rem]" : "text-[2.25rem]"}`}>
                {source.title}
              </span>
              <span className="relative mt-3 block text-[0.8125rem] text-ink-muted">
                {source.tradition} · <SourceSummary source={source} />
              </span>
              <span className="relative mt-4 line-clamp-5 text-[0.9375rem] leading-relaxed text-ink-soft">
                {source.description}
              </span>
              <span className="relative mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-ink">
                <T k="explore.open" />
                <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {gita && (
        <div className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="display text-[1.875rem] leading-tight text-ink">
              <T k="explore.chapters" values={{ title: gita.title }} />
            </h3>
            <Link
              href={`/scripture/${gita.id}/1`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
            >
              <T k="explore.start" />
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
          <ol className="mt-5 grid grid-cols-1 gap-x-8 border-t border-rule sm:grid-cols-2 lg:grid-cols-3">
            {gita.divisions.map((d) => (
              <li key={String(d.number)} className="reveal border-b border-rule">
                <Link href={`/scripture/${gita.id}/${d.number}`} className="group flex items-baseline gap-3 py-3">
                  <span className="w-6 shrink-0 text-right font-serif text-base text-accent tabular-nums">{d.number}</span>
                  <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-ink-soft transition-colors group-hover:text-ink">
                    {d.title ?? <T k={divisionKey(gita.division_label)} values={{ n: d.number }} />}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted tabular-nums">{d.passage_count}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-8 text-sm text-ink-muted">
        <T k="explore.more" />
      </p>
    </section>
  );
}

async function Stories() {
  await connection();
  const stories = (await getStories()) ?? [];
  if (!stories.length) return null;
  return (
    <section id="stories" aria-labelledby="stories-title" className="mt-28 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="stories-title" className="display text-[clamp(2.25rem,4vw,3.25rem)] leading-tight text-ink">
            <T k="explore.stories" />
          </h2>
          <Label kind="editorial" />
        </div>
        <span className="text-sm text-ink-muted">
          <T k="explore.stories.note" />
        </span>
      </div>
      <ul className="divide-y divide-rule">
        {stories.map((story) => (
          <li key={story.id} className="reveal">
            <Link
              href={`/stories/${story.id}`}
              className="group grid grid-cols-1 gap-x-16 gap-y-3 py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
            >
              <span>
                <span className="display block text-[2.5rem] leading-tight text-ink decoration-gold/50 underline-offset-[6px] group-hover:underline">
                  {story.title}
                </span>
                <span className="mt-2 block text-[0.8125rem] text-ink-muted">{story.location}</span>
              </span>
              <span>
                <span className="block font-serif text-[1.25rem] leading-relaxed text-ink-soft italic">{story.dilemma}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                  <T k="explore.readStory" />
                  <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
