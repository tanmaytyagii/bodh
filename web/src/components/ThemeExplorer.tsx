"use client";

import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/useLocale";
import { journey } from "@/lib/journey";

import { EditorialText } from "./CitedText";
import { T } from "./i18n/T";
import { Icon } from "./Icon";

export interface ExplorerPath {
  id: string;
  title: MessageKey;
  description: MessageKey;
  themes: { id: string; name: string; summary: string }[];
}

/** How many themes a path shows before "all themes". */
const SHOWN = 5;

/**
 * The editorial paths into the themes, as tabs: pointing at a path (with a
 * mouse), focusing it or choosing it opens it beside the list, with its
 * themes. Arrow keys move between paths. On the landing page the instrument
 * turns to the path in focus.
 */
export function ThemeExplorer({ paths, pathLinks }: { paths: ExplorerPath[]; pathLinks: "anchor" | "page" }) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const path = paths[selected];
  if (!path) return null;

  const select = (index: number) => {
    setSelected(index);
    journey.setFocus(index);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = paths.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? selected === last
          ? 0
          : selected + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? selected === 0
            ? last
            : selected - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    tabs.current[next]?.focus();
  };
  const href = (pathId: string) => (pathLinks === "anchor" ? `#path-${pathId}` : `/concepts#path-${pathId}`);

  return (
    <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div role="tablist" aria-label={t("themes.paths")} aria-orientation="vertical" className="grid grid-cols-2 gap-2 lg:block lg:space-y-1">
        {paths.map((item, i) => {
          const current = i === selected;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[i] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={current}
              aria-controls={`${id}-panel`}
              tabIndex={current ? 0 : -1}
              onClick={() => select(i)}
              onFocus={() => select(i)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") select(i);
              }}
              onKeyDown={onKeyDown}
              className={`group relative flex w-full items-baseline gap-3 rounded-2xl px-4 py-3 text-left transition-[background-color,box-shadow,translate] duration-300 ease-out-soft lg:gap-5 lg:rounded-none lg:border-b lg:border-rule lg:px-1 lg:py-5 ${
                current
                  ? "bg-surface-raised shadow-card ring-1 ring-gold/40 lg:translate-x-3 lg:bg-transparent lg:shadow-none lg:ring-0"
                  : "bg-surface/60 ring-1 ring-rule lg:bg-transparent lg:ring-0"
              }`}
            >
              <span
                aria-hidden
                className={`hidden font-serif text-[1.75rem] leading-none tabular-nums transition-colors lg:block ${
                  current ? "text-gold" : "text-ink-muted"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`display min-w-0 flex-1 text-[1.25rem] leading-tight transition-colors sm:text-[1.5rem] lg:text-[clamp(1.75rem,2.6vw,2.375rem)] ${
                  current ? "text-ink" : "text-ink-soft group-hover:text-ink"
                }`}
              >
                <T k={item.title} />
              </span>
              <span className="hidden text-xs text-ink-muted lg:inline">
                <T k={item.themes.length === 1 ? "themes.count.one" : "themes.count.other"} values={{ count: item.themes.length }} />
              </span>
              <span
                aria-hidden
                className={`absolute top-1/2 -left-3 hidden h-8 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-opacity lg:block ${
                  current ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selected}`}
        className="relative overflow-hidden rounded-[1.75rem] bg-surface/92 p-6 shadow-raised ring-1 ring-rule backdrop-blur-xl sm:p-9 lg:min-h-[34rem]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-gold/20" />
        <div key={path.id} className="rise relative">
          <p className="flex items-baseline justify-between gap-4">
            <span aria-hidden className="font-serif text-[2.75rem] leading-none text-gold tabular-nums">
              {String(selected + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-ink-muted">
              <T k={path.themes.length === 1 ? "themes.count.one" : "themes.count.other"} values={{ count: path.themes.length }} />
            </span>
          </p>
          <h3 className="display mt-5 text-[clamp(2rem,3.4vw,3rem)] leading-[1.02] text-ink">
            <T k={path.title} />
          </h3>
          <p className="mt-3 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft">
            <T k={path.description} />
          </p>
          <ul className="mt-8 divide-y divide-rule border-y border-rule">
            {path.themes.slice(0, SHOWN).map((theme) => (
              <li key={theme.id}>
                <Link href={`/concepts/${theme.id}`} className="group flex items-baseline gap-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink decoration-gold/60 underline-offset-4 group-hover:underline">
                      {theme.name}
                    </span>
                    <span className="mt-1 line-clamp-1 text-sm text-ink-muted">
                      <EditorialText text={theme.summary} inline interactive={false} />
                    </span>
                  </span>
                  <Icon
                    name="arrowRight"
                    className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={href(path.id)}
            className="group mt-6 inline-flex items-center gap-2 text-[0.9375rem] font-medium text-ink"
          >
            {path.themes.length > SHOWN ? (
              <T k="themes.allInPath" values={{ count: path.themes.length }} />
            ) : (
              <T k="themes.openPath" />
            )}
            <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
