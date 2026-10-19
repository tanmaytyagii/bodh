"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { useT } from "@/lib/i18n/useLocale";
import { THEME_PATHS } from "@/lib/themePaths";

import { EditorialText } from "./CitedText";
import { T } from "./i18n/T";
import { Icon } from "./Icon";
import { EmptyState } from "./layout/EmptyState";
import { ThemeExplorer } from "./ThemeExplorer";

export interface ThemeSummary {
  id: string;
  name: string;
  term: string | null;
  summary: string;
  life_situations: string[];
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The editorial themes, grouped into paths and filterable by name, term, summary or situation. */
export function ThemeIndex({ themes }: { themes: ThemeSummary[] }) {
  const translate = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const needle = normalize(deferred.trim());
  const matches = (t: ThemeSummary) =>
    !needle || normalize([t.name, t.term ?? "", t.summary, ...t.life_situations].join(" ")).includes(needle);

  const byId = new Map(themes.map((t) => [t.id, t]));
  const placed = new Set(THEME_PATHS.flatMap((p) => p.themes));
  const paths = [
    ...THEME_PATHS.map((p) => ({ ...p, items: p.themes.map((id) => byId.get(id)).filter((t) => t !== undefined) })),
    {
      id: "more",
      title: "path.more.title" as const,
      description: "path.more.description" as const,
      themes: [],
      items: themes.filter((t) => !placed.has(t.id)),
    },
  ]
    .map((p) => ({ ...p, items: p.items.filter(matches) }))
    .filter((p) => p.items.length > 0);
  const shown = paths.reduce((n, p) => n + p.items.length, 0);

  return (
    <div>
      {!needle && (
        <div className="mb-20">
          <ThemeExplorer
            pathLinks="anchor"
            paths={paths
              .filter((path) => path.id !== "more")
              .map((path) => ({
                id: path.id,
                title: path.title,
                description: path.description,
                themes: path.items.map((t) => ({ id: t.id, name: t.name, summary: t.summary })),
              }))}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-10">
        <div className="group relative w-full max-w-md">
          <label htmlFor="theme-filter" className="sr-only">
            <T k="themes.filter" />
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted group-focus-within:text-accent"
          />
          <input
            id="theme-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate("themes.filter.placeholder")}
            className="h-12 w-full rounded-full bg-surface-raised pr-4 pl-11 text-[0.9375rem] text-ink shadow-card ring-1 ring-field placeholder:text-ink-muted focus:ring-2 focus:ring-accent focus:outline-none"
          />
        </div>
        <p aria-live="polite" className="text-sm text-ink-muted">
          {needle ? (
            <T k="themes.shown" values={{ shown, total: themes.length }} />
          ) : (
            <T k="themes.total" values={{ total: themes.length, paths: THEME_PATHS.length }} />
          )}
        </p>
      </div>

      {paths.length ? (
        paths.map((path, i) => (
          <section
            key={path.id}
            id={`path-${path.id}`}
            aria-labelledby={`path-${path.id}-title`}
            className="grid scroll-mt-24 grid-cols-1 gap-x-16 gap-y-6 border-t border-rule py-12 lg:grid-cols-[17rem_minmax(0,1fr)]"
          >
            <header className="lg:sticky lg:top-24 lg:self-start">
              <p aria-hidden className="font-serif text-[1.75rem] leading-none text-gold tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h2 id={`path-${path.id}-title`} className="display mt-3 text-[2.25rem] leading-[1.05] text-ink">
                <T k={path.title} />
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                <T k={path.description} />
              </p>
            </header>
            <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
              {path.items.map((t) => (
                <li key={t.id} className="reveal border-b border-rule">
                  <Link href={`/concepts/${t.id}`} className="group block py-5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[1.0625rem] font-semibold text-ink decoration-gold/60 underline-offset-4 group-hover:underline">
                        {t.name}
                      </span>
                      <Icon
                        name="arrowRight"
                        className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                      />
                    </span>
                    {t.term && <span className="mt-0.5 block font-serif text-sm text-accent italic">{t.term}</span>}
                    <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">
                      <EditorialText text={t.summary} inline interactive={false} />
                    </span>
                    {t.life_situations.length > 0 && (
                      <span className="mt-2.5 block text-xs leading-snug text-ink-muted">
                        <T k="themes.for" values={{ list: t.life_situations.slice(0, 3).join(" · ") }} />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState icon="search" title={<T k="themes.none.title" />}>
          <T
            k="themes.none.body"
            values={{
              showAll: (
                <button type="button" onClick={() => setQuery("")} className="font-medium text-ink underline underline-offset-2">
                  <T k="themes.showAll" />
                </button>
              ),
            }}
          />
        </EmptyState>
      )}
    </div>
  );
}
