import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReflectionSettings } from "@/components/settings/ReflectionSettings";
import { ThemeSelector } from "@/components/settings/ThemeSelector";
import { BRAND } from "@/lib/brand";
import { textLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Settings",
  description: `Appearance, and the data ${BRAND.name} keeps in your browser.`,
};

const STORED: { what: string; where: string }[] = [
  { what: "Your appearance choice", where: "This browser, until you change it." },
  { what: "Saved reflections and your notes", where: "This browser, until you delete them or clear your browser data." },
  { what: "The current conversation", where: "This tab only. It disappears when you close the tab." },
  {
    what: "On our server",
    where:
      "Nothing you type is stored. Questions are sent to the language-model provider to write a reply. A report you send is kept, and includes your question only if you tick the box.",
  },
];

export default function SettingsPage() {
  return (
    <PageContainer width="medium">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description={`How ${BRAND.name} looks, and what it keeps. There is no account: everything here applies to this browser only.`}
      />

      <div className="border-b border-rule">
        <SettingsRow
          id="appearance"
          title="Appearance"
          description="System follows your device’s light or dark setting, and changes when it does."
        >
          <ThemeSelector />
        </SettingsRow>

        <SettingsRow
          id="reflections"
          title="Saved reflections"
          description="Answers you saved with “Save this reflection”, and your notes on them."
        >
          <ReflectionSettings />
        </SettingsRow>

        <SettingsRow id="privacy" title="Privacy" description="What is stored, and where.">
          <dl className="divide-y divide-rule border-y border-rule">
            {STORED.map((item) => (
              <div key={item.what} className="grid gap-1 py-3.5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
                <dt className="text-sm font-medium text-ink">{item.what}</dt>
                <dd className="text-sm leading-relaxed text-ink-soft">{item.where}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-muted">
            More detail in{" "}
            <Link href="/about#privacy" className={textLink}>
              About · Privacy
            </Link>
            .
          </p>
        </SettingsRow>
      </div>
    </PageContainer>
  );
}

function SettingsRow({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid grid-cols-1 gap-x-12 gap-y-5 border-t border-rule py-10 md:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <div>
        <h2 id={`${id}-title`} className="display text-[1.875rem] leading-tight text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
      <div className="min-w-0 md:pt-1">{children}</div>
    </section>
  );
}
