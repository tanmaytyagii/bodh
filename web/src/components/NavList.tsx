import Link from "next/link";
import type { ComponentProps } from "react";

import { AskLink } from "./AskLink";
import { Icon, type IconName } from "./Icon";

export const NAV_LINKS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: "/", label: "Ask", hint: "Bring a question", icon: "pen" },
  { href: "/explore", label: "Explore", hint: "Read the texts", icon: "bookOpen" },
  { href: "/concepts", label: "Themes", hint: "Paths by situation", icon: "tag" },
  { href: "/reflections", label: "Reflections", hint: "Saved in this browser", icon: "bookmark" },
  { href: "/about", label: "About", hint: "Sources and method", icon: "info" },
];

export const SETTINGS_LINK = { href: "/settings", label: "Settings", hint: "Appearance and saved data", icon: "sliders" as IconName };

/** A navigation link; the one to Ask also brings back its invitation when you are already there. */
export function NavAnchor({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  return href === "/" ? <AskLink {...props} /> : <Link href={href} {...props} />;
}

export function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  if (href === "/explore" && (pathname.startsWith("/scripture") || pathname.startsWith("/stories"))) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop navigation: a floating capsule, with the current page raised inside
 * it. Without a pathname (while prerendering) no link is marked current.
 */
export function NavList({ pathname = null }: { pathname?: string | null }) {
  const settingsActive = isActive(SETTINGS_LINK.href, pathname);
  return (
    <nav aria-label="Main" className="pointer-events-auto ml-auto hidden md:block">
      <ul className="flex items-center gap-0.5 rounded-full bg-paper/75 p-1 shadow-card ring-1 ring-rule backdrop-blur-xl">
        {NAV_LINKS.map((link) => {
          const active = isActive(link.href, pathname);
          return (
            <li key={link.href}>
              <NavAnchor
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.875rem] font-medium transition-[background-color,color,box-shadow] duration-200 ${
                  active
                    ? "bg-surface-raised text-ink shadow-card ring-1 ring-rule"
                    : "text-ink-muted hover:bg-surface-sunk/80 hover:text-ink"
                }`}
              >
                {active && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                {link.label}
              </NavAnchor>
            </li>
          );
        })}
        <li className="flex items-center">
          <span aria-hidden className="mx-1.5 h-5 w-px bg-rule-strong" />
          <Link
            href={SETTINGS_LINK.href}
            aria-current={settingsActive ? "page" : undefined}
            aria-label="Settings"
            title="Settings"
            className={`flex size-9 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-200 ${
              settingsActive
                ? "bg-surface-raised text-ink shadow-card ring-1 ring-rule"
                : "text-ink-muted hover:bg-surface-sunk/80 hover:text-ink"
            }`}
          >
            <Icon name="sliders" className="size-[1.125rem]" />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
