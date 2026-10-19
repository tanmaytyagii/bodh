"use client";

import { useSyncExternalStore, type ReactNode } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/**
 * The fixed layer that holds the floating navigation. It is not a bar: the
 * layer itself lets clicks through to the page, and only its pills take
 * them. Once the page scrolls, the pills that are clear at the top (the
 * name) gain a frosted backdrop of their own, and a veil of the paper fades
 * in behind them, so text scrolling underneath never collides with them.
 */
export function HeaderFrame({ children }: { children: ReactNode }) {
  const scrolled = useSyncExternalStore(
    subscribe,
    () => window.scrollY > 8,
    () => false,
  );
  return (
    <header
      data-scrolled={scrolled}
      className="group/header pointer-events-none fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)]"
    >
      <span aria-hidden className="header-veil" />
      <div className="relative">{children}</div>
    </header>
  );
}
