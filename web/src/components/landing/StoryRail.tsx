"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { T } from "@/components/i18n/T";
import { useT } from "@/lib/i18n/useLocale";
import { journey } from "@/lib/journey";
import { STORY_CHAPTERS } from "@/lib/scene";

/**
 * Where you are in the landing story: a quiet rail of chapter marks at the
 * right edge of large screens, each a link to its chapter that shows its name
 * on hover and focus, and a hairline of progress across the top of smaller
 * screens.
 */
export function StoryRail() {
  const t = useT();
  const chapter = useSyncExternalStore(journey.subscribe, journey.getChapter, () => 0);
  const line = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = line.current;
    if (!element) return;
    const last = STORY_CHAPTERS.length - 1;
    const apply = () => element.style.setProperty("--progress", String(journey.position / last));
    apply();
    return journey.subscribeMotion(apply);
  }, []);

  return (
    <>
      <nav aria-label={t("landing.chapters")} className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 lg:block xl:right-7">
        <ol className="flex flex-col items-end gap-1">
          {STORY_CHAPTERS.map((item, i) => {
            const current = i === chapter;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={current ? "step" : undefined}
                  className="group flex h-8 items-center gap-3 rounded-full py-1 pr-1.5 pl-3"
                >
                  <span
                    className="pointer-events-none translate-x-1 rounded-full bg-paper/85 px-2.5 py-1 text-xs font-medium text-ink opacity-0 shadow-card ring-1 ring-rule backdrop-blur-md transition-[opacity,translate] duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                  >
                    <span className="mr-1.5 font-serif text-accent tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <T k={item.label} />
                  </span>
                  <span
                    aria-hidden
                    className={`block rounded-full transition-all duration-300 ${
                      current ? "h-6 w-1.5 bg-accent" : "size-1.5 bg-ink-muted/60 group-hover:bg-ink"
                    }`}
                  />
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        ref={line}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left scale-x-(--progress) bg-accent/80 lg:hidden"
        style={{ ["--progress" as string]: "0" }}
      />
    </>
  );
}
