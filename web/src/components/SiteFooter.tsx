import type { ReactNode } from "react";

import { BRAND } from "@/lib/brand";
import type { MessageKey } from "@/lib/i18n/messages";

import { Wordmark } from "./brand/Wordmark";
import { T } from "./i18n/T";
import { NavAnchor } from "./NavList";

const READ: { href: string; label: MessageKey }[] = [
  { href: "/", label: "footer.ask" },
  { href: "/explore", label: "footer.explore" },
  { href: "/concepts", label: "nav.themes" },
  { href: "/reflections", label: "save.yourReflections" },
];

const ABOUT: { href: string; label: MessageKey }[] = [
  { href: "/about#method", label: "footer.method" },
  { href: "/about#sources", label: "footer.sources" },
  { href: "/about#privacy", label: "footer.privacy" },
  { href: "/settings", label: "nav.settings" },
];

export function SiteFooter() {
  return (
    <footer className="footer-fade relative z-10 mt-28 border-t border-rule bg-paper">
      <div className="mx-auto max-w-page px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr_1.3fr] md:gap-8">
          <div className="max-w-xs">
            <p>
              <Wordmark size="lg" />
            </p>
            <p className="display mt-5 text-[1.375rem] leading-snug text-ink-soft">
              <T k="brand.tagline" />
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              <T k="footer.what" />
            </p>
          </div>
          <FooterLinks id="footer-read" title={<T k="footer.read" />} links={READ} />
          <FooterLinks id="footer-about" title={<T k="footer.about" values={{ name: BRAND.name }} />} links={ABOUT} />
          <div>
            <h2 className="text-[0.8125rem] font-semibold text-ink">
              <T k="footer.support" />
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              <T
                k="footer.support.body"
                values={{
                  tele: <span className="font-semibold text-ink">14416</span>,
                  emergency: <span className="font-semibold text-ink">112</span>,
                }}
              />
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-rule py-6 text-xs leading-relaxed text-ink-muted sm:flex-row sm:justify-between sm:gap-8">
          <p>
            <T k="footer.texts" />
          </p>
          <p className="shrink-0">
            <T k="footer.private" />
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ id, title, links }: { id: string; title: ReactNode; links: { href: string; label: MessageKey }[] }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="text-[0.8125rem] font-semibold text-ink">
        {title}
      </h2>
      <ul className="mt-3 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <NavAnchor href={link.href} className="text-ink-muted transition-colors hover:text-ink">
              <T k={link.label} />
            </NavAnchor>
          </li>
        ))}
      </ul>
    </nav>
  );
}
