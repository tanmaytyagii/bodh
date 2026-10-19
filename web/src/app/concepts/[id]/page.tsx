import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AskAboutLink } from "@/components/AskAboutLink";
import { EditorialText, type EditorialLink } from "@/components/CitedText";
import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { Label } from "@/components/Label";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { VerseCard } from "@/components/VerseCard";
import { getConcept } from "@/lib/api";
import { buttonClass, panelHeading } from "@/lib/ui";

type Props = PageProps<"/concepts/[id]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  const concept = await getConcept(id);
  return concept ? { title: concept.name, description: concept.summary } : {};
}

export default function ConceptPage(props: Props) {
  return (
    <PageContainer width="wide">
      <Suspense fallback={<LoadingState variant="page" />}>
        <ConceptView params={props.params} />
      </Suspense>
    </PageContainer>
  );
}

async function ConceptView({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const concept = await getConcept(id);
  if (!concept) notFound();
  const links: EditorialLink[] = concept.passages.map((p) => ({
    id: p.id,
    short_ref: p.short_ref,
    path: p.path,
    ref: p.ref,
    translation: p.translation,
  }));
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: <T k="nav.themes" />, href: "/concepts" }, { label: concept.name }]}
        eyebrow={
          <Label kind="editorial">
            <T k="theme.eyebrow" />
          </Label>
        }
        title={concept.name}
        meta={concept.term && <span className="font-serif text-xl text-accent italic">{concept.term}</span>}
        actions={
          <AskAboutLink
            question="ask.about.theme"
            values={{ theme: concept.name }}
            about={concept.name}
            passageIds={concept.passages.slice(0, 4).map((p) => p.id)}
            className={buttonClass("primary", "md")}
          >
            <Icon name="reply" className="size-4 -scale-x-100" />
            <T k="theme.ask" />
          </AskAboutLink>
        }
      />

      <div className="grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <EditorialText
          text={concept.summary}
          links={links}
          className="border-l-2 border-editorial/50 pl-6 text-[calc(1.1875rem*var(--reading-scale))] leading-[1.75] text-ink sm:text-[calc(1.25rem*var(--reading-scale))]"
        />
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-1">
          {concept.life_situations.length > 0 && (
            <div>
              <h2 className={panelHeading}>
                <T k="theme.situations" />
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-snug text-ink-soft">
                {concept.life_situations.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden className="mt-[0.45rem] size-1 shrink-0 rotate-45 bg-editorial" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {concept.caveats.length > 0 && (
            <div>
              <h2 className={`${panelHeading} flex items-center gap-1.5`}>
                <Icon name="info" className="size-4 text-info" />
                <T k="theme.care" />
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
                {concept.caveats.map((c) => (
                  <li key={c}>
                    <EditorialText text={c} links={links} inline />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="passages" className="reveal mt-24">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="passages" className="display text-[clamp(2.25rem,4vw,3rem)] leading-tight text-ink">
            <T k="theme.passages" />
          </h2>
          <span className="text-sm text-ink-muted">{concept.passages.length}</span>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-x-14 xl:grid-cols-2">
          {concept.passages.map((p) => (
            <div key={p.id} className="border-t border-rule">
              <VerseCard passage={p} variant="plain" compact />
            </div>
          ))}
        </div>
      </section>

      {concept.related.length > 0 && (
        <section aria-labelledby="related" className="reveal mt-20 border-t border-rule-strong pt-10">
          <h2 id="related" className={panelHeading}>
            <T k="theme.related" />
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {concept.related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/concepts/${r.id}`}
                  className="group inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-ink ring-1 ring-rule transition-colors hover:bg-surface-raised hover:ring-gold"
                >
                  {r.name}
                  <Icon name="arrowRight" className="size-3.5 text-ink-muted group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
