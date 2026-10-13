import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { SourceMetadata } from "@/components/SourceMetadata";
import { VerseCard } from "@/components/VerseCard";
import { getPassageAt } from "@/lib/api";
import type { Passage } from "@/lib/types";

type Props = PageProps<"/scripture/[source]/[chapter]/[verse]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { source, chapter, verse } = await props.params;
  const data = await getPassageAt(source, chapter, verse);
  if (!data) return {};
  return { title: data.passage.ref, description: data.passage.translation.slice(0, 180) };
}

export default function VersePage(props: Props) {
  return (
    <PageContainer width="wide" className="pt-8 sm:pt-10">
      <Suspense fallback={<LoadingState variant="verse" />}>
        <VerseView params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

const SECTION_TITLE = "display text-[clamp(2rem,3vw,2.5rem)] leading-tight text-ink";

async function VerseView({ params }: { params: Props["params"] }) {
  const { source, chapter, verse } = await params;
  const data = await getPassageAt(source, chapter, verse);
  if (!data) notFound();
  const { passage } = data;
  const previous = data.before[data.before.length - 1];
  const next = data.after[0];
  const division = passage.source_id === "bhagavad-gita" ? "Chapter" : "Part";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Explore", href: "/explore" },
          { label: passage.source_title, href: `/scripture/${passage.source_id}` },
          {
            label: `${division} ${passage.chapter}`,
            href: `/scripture/${passage.source_id}/${passage.chapter}#v${passage.verse}`,
          },
          { label: `Verse ${passage.verse}` },
        ]}
      />

      {/* The verse, set on its own, with the neighbouring verses at either hand. */}
      <div className="mt-10 grid grid-cols-1 items-center gap-6 xl:grid-cols-[9rem_minmax(0,1fr)_9rem]">
        <div className="hidden xl:block">{previous && <SideLink passage={previous} direction="previous" />}</div>
        <div className="mx-auto w-full max-w-[52rem]">
          <VerseCard passage={passage} headingLevel={1} showVerseLink={false} />
          {data.stories.length > 0 && (
            <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-soft">
              <Label kind="editorial">Story</Label>
              <span>
                Part of{" "}
                {data.stories.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    <Link
                      href={`/stories/${s.id}`}
                      className="font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent"
                    >
                      {s.title}
                    </Link>
                  </span>
                ))}
              </span>
            </p>
          )}
        </div>
        <div className="hidden xl:block">{next && <SideLink passage={next} direction="next" />}</div>
      </div>

      <nav aria-label="Verses" className="mx-auto mt-6 grid max-w-[52rem] grid-cols-2 gap-3 xl:hidden">
        {previous ? (
          <Link href={previous.path} className="group flex items-center gap-2 py-2 text-sm">
            <Icon name="arrowLeft" className="size-4 text-ink-muted transition-transform group-hover:-translate-x-0.5" />
            <span className="font-medium text-ink">{previous.short_ref}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next.path} className="group flex items-center justify-end gap-2 py-2 text-sm">
            <span className="font-medium text-ink">{next.short_ref}</span>
            <Icon name="arrowRight" className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </nav>

      <div className="mx-auto mt-24 grid max-w-[78rem] grid-cols-1 gap-x-16 gap-y-20 lg:grid-cols-2">
        {data.before.length + data.after.length > 0 && (
          <section aria-labelledby="context" className="reveal">
            <h2 id="context" className={SECTION_TITLE}>
              Surrounding verses
            </h2>
            <p className="mt-2 text-sm text-ink-muted">Read the verse in its place in the text.</p>
            <ol className="mt-6 border-l border-rule-strong">
              {data.before.map((p) => (
                <ContextVerse key={p.id} passage={p} />
              ))}
              <li className="relative -ml-px border-l-2 border-accent py-4 pr-2 pl-6">
                <span aria-hidden className="absolute top-[1.45rem] -left-[5px] size-2 rotate-45 bg-accent" />
                <p className="text-xs font-semibold text-accent">{passage.ref} · this verse</p>
                <p className="mt-1 font-serif text-[1.0625rem] leading-relaxed text-ink">{passage.translation}</p>
              </li>
              {data.after.map((p) => (
                <ContextVerse key={p.id} passage={p} />
              ))}
            </ol>
          </section>
        )}

        <div className="space-y-20">
          {data.concepts.length > 0 && (
            <section aria-labelledby="themes" className="reveal">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 id="themes" className={SECTION_TITLE}>
                  Themes
                </h2>
                <Label kind="editorial" />
              </div>
              <ul className="mt-6 divide-y divide-rule border-y border-rule">
                {data.concepts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/concepts/${c.id}`} className="group block py-5">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[1.0625rem] font-semibold text-ink decoration-gold/60 underline-offset-4 group-hover:underline">
                          {c.name}
                        </span>
                        <Icon name="arrowRight" className="size-4 text-ink-muted" />
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{c.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.related.length > 0 && (
            <section aria-labelledby="related" className="reveal">
              <h2 id="related" className={SECTION_TITLE}>
                Related passages
              </h2>
              <ul className="mt-6 divide-y divide-rule border-y border-rule">
                {data.related.map(({ passage: p, reason, kind }) => (
                  <li key={p.id}>
                    <Link href={p.path} className="group grid gap-1.5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
                      <span className="text-sm font-semibold text-source group-hover:underline">{p.short_ref}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-serif text-[0.9375rem] leading-relaxed text-ink">{p.translation}</span>
                        <span className={`mt-1 block text-xs leading-snug ${kind === "theme" ? "text-editorial" : "text-ink-muted"}`}>
                          {reason}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="mx-auto mt-24 max-w-[78rem] border-t border-rule-strong pt-10">
        <SourceMetadata passage={passage} />
      </div>
    </>
  );
}

/** Previous / next verse beside the plate on wide screens. */
function SideLink({ passage, direction }: { passage: Passage; direction: "previous" | "next" }) {
  const previous = direction === "previous";
  return (
    <Link
      href={passage.path}
      className={`group flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:bg-surface-sunk ${previous ? "items-start" : "items-end text-right"}`}
    >
      <span className="flex size-11 items-center justify-center rounded-full ring-1 ring-rule-strong transition-colors group-hover:ring-gold">
        <Icon name={previous ? "arrowLeft" : "arrowRight"} className="size-4 text-ink" />
      </span>
      <span className="text-xs text-ink-muted">{previous ? "Previous" : "Next"}</span>
      <span className="text-sm font-semibold text-ink">{passage.short_ref}</span>
    </Link>
  );
}

function ContextVerse({ passage }: { passage: Passage }) {
  return (
    <li className="py-4 pr-2 pl-6">
      <Link href={passage.path} className="text-xs font-medium text-ink-muted transition-colors hover:text-ink">
        {passage.ref}
        {passage.speaker ? ` · ${passage.speaker}` : ""}
      </Link>
      <p className="mt-1 font-serif leading-relaxed text-ink-soft">{passage.translation}</p>
    </li>
  );
}
