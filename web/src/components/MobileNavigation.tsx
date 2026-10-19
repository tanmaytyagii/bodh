"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useT } from "@/lib/i18n/useLocale";

import { T } from "./i18n/T";
import { Icon } from "./Icon";
import { isActive, NAV_LINKS, NavAnchor, SETTINGS_LINK } from "./NavList";
import { LanguageSelector } from "./preferences/LanguageSelector";
import { ReadingSettings } from "./preferences/ReadingSettings";

/** Small screens: a floating menu button that opens the navigation as a full panel. */
export function MobileNavigation({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const t = useT();

  // Close after navigating.
  if (pathname !== shownFor) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    // The panel covers the page; keep the page behind it from scrolling.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const settingsActive = isActive(SETTINGS_LINK.href, pathname);

  return (
    <div className="pointer-events-auto ml-auto md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-full bg-paper/75 text-ink shadow-card ring-1 ring-rule backdrop-blur-xl transition-colors hover:bg-surface-raised"
      >
        <Icon name={open ? "close" : "menu"} className="size-5" />
        <span className="sr-only">{open ? <T k="nav.closeMenu" /> : <T k="nav.menu" />}</span>
      </button>
      {open && (
        <nav
          id={panelId}
          aria-label={t("nav.main")}
          className="rise pointer-events-auto fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-0 z-40 overflow-y-auto bg-paper px-6 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
        >
          <ul className="divide-y divide-rule border-b border-rule">
            {NAV_LINKS.map((link, i) => {
              const active = isActive(link.href, pathname);
              return (
                <li key={link.href} className="rise" style={{ animationDelay: `${60 + i * 40}ms` }}>
                  <NavAnchor
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="group flex items-center gap-4 py-4"
                  >
                    <span className="w-6 text-xs text-ink-muted tabular-nums">0{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`display block text-[2rem] leading-none ${active ? "text-ink" : "text-ink-soft"}`}>
                        <T k={link.label} />
                      </span>
                      <span className="mt-1.5 block text-[0.8125rem] text-ink-muted">
                        <T k={link.hint} />
                      </span>
                    </span>
                    {active ? (
                      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                    ) : (
                      <Icon name="arrowRight" className="size-4 text-ink-muted" />
                    )}
                  </NavAnchor>
                </li>
              );
            })}
          </ul>
          <section aria-labelledby={`${panelId}-preferences`} className="mt-6 rounded-2xl bg-surface px-4 py-4 ring-1 ring-rule">
            <h2 id={`${panelId}-preferences`} className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
              <Icon name="languages" className="size-4 text-ink-muted" />
              <T k="prefs.language" />
            </h2>
            <div className="mt-2.5">
              <LanguageSelector />
            </div>
            <div className="mt-5 border-t border-rule pt-4">
              <ReadingSettings />
            </div>
          </section>
          <Link
            href={SETTINGS_LINK.href}
            aria-current={settingsActive ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`mt-6 flex items-center gap-3 rounded-2xl px-4 py-3.5 ring-1 ring-rule ${
              settingsActive ? "bg-surface-sunk" : "bg-surface"
            }`}
          >
            <Icon name="sliders" className="size-5 text-ink-soft" />
            <span className="flex-1">
              <span className="block text-[0.9375rem] font-medium text-ink">
                <T k={SETTINGS_LINK.label} />
              </span>
              <span className="block text-[0.8125rem] text-ink-muted">
                <T k={SETTINGS_LINK.hint} />
              </span>
            </span>
            <Icon name="chevronRight" className="size-4 text-ink-muted" />
          </Link>
          <p className="mt-8 text-[0.8125rem] leading-relaxed text-ink-muted">
            <T
              k="nav.support"
              values={{
                tele: <span className="font-semibold text-ink">14416</span>,
                emergency: <span className="font-semibold text-ink">112</span>,
              }}
            />
          </p>
        </nav>
      )}
    </div>
  );
}
