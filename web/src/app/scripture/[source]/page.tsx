import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSource } from "@/lib/api";
import { buttonClass, panelHeading } from "@/lib/ui";

type Props = PageProps<"/scripture/[source]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { source } = await props.params;
  const data = await getSource(source);
  return data ? { title: data.title, description: data.description } : {};
}

export default function SourcePage(props: Props) {
  return (
    <PageContainer width="wide">
      <Suspense fallback={<LoadingState variant="page" />}>
        <SourceOverview params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

async function SourceOverview({ params }: { params: Props["params"] }) {
  const { source: id } = await params;
  const source = await getSource(id);
  if (!source) notFound();
  const primary = source.editions.find((e) => e.role === "primary");
  const first = source.divisions[0];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Explore", href: "/explore" }, { label: source.title }]}
        eyebrow={source.tradition}
        title={
          <>
            {source.title_original && (
              <span lang="sa" className="deva mb-2 block text-[clamp(1.75rem,3vw,2.5rem)] tracking-normal text-gold">
                {source.title_original}
              </span>
            )}
            {source.title}
          </>
        }
        meta={`${source.passage_count} verses · ${source.divisions.length} ${source.division_label.toLowerCase()}${
          source.divisions.length === 1 ? "" : "s"
        }`}
        description={<p className="max-w-2xl">{source.description}</p>}
        actions={
          first && (
            <Link href={`/scripture/${source.id}/${first.number}`} className={buttonClass("primary", "lg")}>
              Start reading
              <Icon name="arrowRight" className="size-4" />
            </Link>
          )
        }
      />

      <section aria-labelledby="contents">
        <h2 id="contents" className="eyebrow text-ink-muted">
          Contents
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-x-12 border-t border-rule lg:grid-cols-2">
          {source.divisions.map((d) => (
            <li key={String(d.number)} className="reveal border-b border-rule">
              <Link href={`/scripture/${source.id}/${d.number}`} className="group flex items-center gap-5 py-4">
                <span className="w-10 shrink-0 text-right font-serif text-[1.5rem] leading-none text-gold tabular-nums">
                  {d.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.0625rem] font-medium text-ink decoration-gold/60 underline-offset-4 group-hover:underline">
                    {d.title ?? `${source.division_label} ${d.number}`}
                  </span>
                  {d.title_original && (
                    <span lang="sa" className="deva block text-sm leading-normal text-ink-muted">
                      {d.title_original}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-ink-muted tabular-nums">{d.passage_count} verses</span>
                <Icon name="chevronRight" className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {primary && (
        <section
          aria-labelledby="edition"
          className="mt-24 grid grid-cols-1 gap-x-16 gap-y-6 border-t border-rule-strong pt-10 text-[0.9375rem] leading-relaxed text-ink-soft lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3fr)]"
        >
          <h2 id="edition" className="display text-[2.25rem] leading-tight text-ink">
            About this edition
          </h2>
          <div>
            <p>
              <span className="font-medium text-ink">{primary.title}</span>, {primary.contributors}
              {primary.publisher ? `, ${primary.publisher}` : ""}
              {primary.year ? `, ${primary.year}` : ""}.
            </p>
            {primary.notes && <p className="mt-3">{primary.notes}</p>}
          </div>
          <div className="text-sm">
            <h3 className={panelHeading}>Licence</h3>
            <p className="mt-1">{primary.license}</p>
            <a
              href={primary.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent"
            >
              Read the transcription ↗
            </a>
          </div>
        </section>
      )}
    </>
  );
}
