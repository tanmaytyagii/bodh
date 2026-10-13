import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { VerseCard } from "@/components/VerseCard";
import { getStory } from "@/lib/api";
import { panelHeading } from "@/lib/ui";

type Props = PageProps<"/stories/[id]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  const story = await getStory(id);
  return story ? { title: story.title, description: story.dilemma } : {};
}

export default function StoryPage(props: Props) {
  return (
    <PageContainer width="wide">
      <Suspense fallback={<LoadingState variant="page" />}>
        <StoryView params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

const SECTION_TITLE = "display text-[2rem] leading-tight text-ink";

async function StoryView({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const story = await getStory(id);
  if (!story) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Explore", href: "/explore" },
          { label: "Stories", href: "/explore#stories" },
          { label: story.title },
        ]}
        eyebrow={<Label kind="editorial">Editorial summary</Label>}
        title={story.title}
        meta={story.location}
      />

      <dl className="mb-16 grid grid-cols-1 gap-x-12 gap-y-6 border-y border-rule py-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <dt className={panelHeading}>Characters</dt>
          <dd className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-soft">
            {story.characters.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt className={panelHeading}>Where it is told</dt>
          <dd className="mt-2 text-sm text-ink-soft">{story.location}</dd>
        </div>
      </dl>

      <div>
        <div className="min-w-0">
          <section aria-labelledby="reading" className="max-w-reading">
            <h2 id="reading" className="sr-only">
              The editors’ reading of the story
            </h2>
            <p className="flex gap-2.5 rounded-2xl bg-editorial-bg px-4 py-3 text-[0.8125rem] leading-relaxed text-ink-soft">
              <Icon name="info" className="mt-0.5 size-4 shrink-0 text-editorial" />
              The summary and analysis below are the editors’ reading of the story. Every quotation in them is checked
              word-for-word against the passages further down — read those to judge for yourself.
            </p>
            <p className="mt-8 text-[1.1875rem] leading-[1.75] text-ink">{story.summary}</p>

            <h3 className={`${SECTION_TITLE} mt-16`}>The dilemma</h3>
            <figure className="relative mt-5 pl-10">
              <span aria-hidden className="display absolute -top-3 left-0 text-[4rem] leading-none text-gold">
                “
              </span>
              <p className="display text-[1.75rem] leading-snug text-pretty text-ink italic">{story.dilemma}</p>
            </figure>

            <h3 className={`${SECTION_TITLE} mt-16`}>Choices and consequences</h3>
            <ol className="mt-6">
              {story.choices.map((c, i) => (
                <li key={i} className="reveal relative pb-8 pl-14 last:pb-0">
                  {i < story.choices.length - 1 && (
                    <span aria-hidden className="absolute top-11 bottom-0 left-[1.1875rem] w-px bg-rule-strong" />
                  )}
                  <span
                    aria-hidden
                    className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full font-serif text-lg text-editorial ring-1 ring-rule-strong"
                  >
                    {i + 1}
                  </span>
                  <p className="eyebrow pt-1 text-ink-muted">{c.actor}</p>
                  <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-ink">{c.choice}</p>
                  {c.consequence && (
                    <p className="mt-2 flex gap-2 text-[0.9375rem] leading-relaxed text-ink-soft">
                      <Icon name="arrowRight" className="mt-1 size-3.5 shrink-0 text-ink-muted" />
                      <span>{c.consequence}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <h3 className={`${SECTION_TITLE} mt-16`}>What it can teach</h3>
            <ul className="mt-5 divide-y divide-rule border-y border-rule">
              {story.lessons.map((l) => (
                <li key={l} className="flex gap-3 py-4 text-[1.0625rem] leading-relaxed text-ink">
                  <span aria-hidden className="mt-[0.7rem] size-1.5 shrink-0 rotate-45 bg-editorial" />
                  {l}
                </li>
              ))}
            </ul>

            {story.caveats.length > 0 && (
              <div className="mt-10 rounded-2xl bg-info-bg px-5 py-4">
                <h3 className={`${panelHeading} flex items-center gap-1.5`}>
                  <Icon name="info" className="size-4 text-info" />
                  Read with care
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
                  {story.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section aria-labelledby="excerpts" className="reveal mt-24">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule pb-4">
              <h2 id="excerpts" className={SECTION_TITLE}>
                The story in the text ({story.excerpts.length} verses)
              </h2>
              <Label kind="source" />
            </div>
            <div className="grid grid-cols-1 gap-x-14 xl:grid-cols-2">
              {story.excerpts.map((p) => (
                <div key={p.id} className="border-t border-rule first:border-t-0 xl:[&:nth-child(2)]:border-t-0">
                  <VerseCard passage={p} variant="plain" compact />
                </div>
              ))}
            </div>
          </section>

          {story.related.length > 0 && (
            <section aria-labelledby="related" className="mt-20">
              <h2 id="related" className={`${SECTION_TITLE} border-b border-rule pb-4`}>
                Related passages
              </h2>
              <div className="grid grid-cols-1 gap-x-14 xl:grid-cols-2">
                {story.related.map((p) => (
                  <div key={p.id} className="border-t border-rule first:border-t-0 xl:[&:nth-child(2)]:border-t-0">
                    <VerseCard passage={p} variant="plain" compact />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

      </div>
    </>
  );
}
