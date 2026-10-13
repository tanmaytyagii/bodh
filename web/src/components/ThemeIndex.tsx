"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { THEME_PATHS } from "@/lib/themePaths";

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
      title: "More themes",
      description: "Further themes in the index.",
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
            Filter themes
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
            placeholder="Filter by situation — “anger”, “exam”, “grief”…"
            className="h-12 w-full rounded-full bg-surface-raised pr-4 pl-11 text-[0.9375rem] text-ink shadow-card ring-1 ring-field placeholder:text-ink-muted focus:ring-2 focus:ring-accent focus:outline-none"
          />
        </div>
        <p aria-live="polite" className="text-sm text-ink-muted">
          {needle ? `${shown} of ${themes.length} themes` : `${themes.length} themes in ${THEME_PATHS.length} paths`}
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
                {path.title}
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{path.description}</p>
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
                    <span className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{t.summary}</span>
                    {t.life_situations.length > 0 && (
                      <span className="mt-2.5 block text-xs leading-snug text-ink-muted">
                        For {t.life_situations.slice(0, 3).join(" · ")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState icon="search" title="No themes match">
          Try another word, or{" "}
          <button type="button" onClick={() => setQuery("")} className="font-medium text-ink underline underline-offset-2">
            show all themes
          </button>
          .
        </EmptyState>
      )}
    </div>
  );
}
