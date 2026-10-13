import { BRAND } from "@/lib/brand";

import { Wordmark } from "./brand/Wordmark";
import { NavAnchor } from "./NavList";

const READ = [
  { href: "/", label: "Ask a question" },
  { href: "/explore", label: "Explore the texts" },
  { href: "/concepts", label: "Themes" },
  { href: "/reflections", label: "Your reflections" },
];

const ABOUT = [
  { href: "/about#method", label: "How answers are made" },
  { href: "/about#sources", label: "Sources & licences" },
  { href: "/about#privacy", label: "Privacy" },
  { href: "/settings", label: "Settings" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-28 border-t border-rule bg-paper">
      <div className="mx-auto max-w-page px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr_1.3fr] md:gap-8">
          <div className="max-w-xs">
            <p>
              <Wordmark size="lg" />
            </p>
            <p className="display mt-5 text-[1.375rem] leading-snug text-ink-soft">{BRAND.tagline}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              AI-assisted reflection, grounded in passages you can check. Not a religious authority, and
              not a substitute for professional help.
            </p>
          </div>
          <FooterLinks title="Read" links={READ} />
          <FooterLinks title={`About ${BRAND.name}`} links={ABOUT} />
          <div>
            <h2 className="text-[0.8125rem] font-semibold text-ink">If you need support now</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              In India, Tele-MANAS offers free mental health support, 24×7, on{" "}
              <span className="font-semibold text-ink">14416</span>. In an emergency, call{" "}
              <span className="font-semibold text-ink">112</span>.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-rule py-6 text-xs leading-relaxed text-ink-muted sm:flex-row sm:justify-between sm:gap-8">
          <p>
            Texts: the Bhagavad Gita, translated by Annie Besant (1922), and the Isha, Katha and Kena
            Upanishads, translated by Swami Paramananda (1919). Both in the public domain.
          </p>
          <p className="shrink-0">Your questions are not stored on our server.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[0.8125rem] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <NavAnchor href={link.href} className="text-ink-muted transition-colors hover:text-ink">
              {link.label}
            </NavAnchor>
          </li>
        ))}
      </ul>
    </nav>
  );
}
