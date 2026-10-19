import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { T } from "@/components/i18n/T";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { LanguageSelector } from "@/components/preferences/LanguageSelector";
import { ReadingSettings } from "@/components/preferences/ReadingSettings";
import { ReflectionSettings } from "@/components/settings/ReflectionSettings";
import { ThemeSelector } from "@/components/settings/ThemeSelector";
import { BRAND } from "@/lib/brand";
import type { MessageKey } from "@/lib/i18n/messages";
import { textLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Settings",
  description: `Appearance, language, reading, and the data ${BRAND.name} keeps in your browser.`,
};

const STORED: { what: MessageKey; where: MessageKey }[] = [
  { what: "settings.stored.choices", where: "settings.stored.choices.where" },
  { what: "settings.stored.reflections", where: "settings.stored.reflections.where" },
  { what: "settings.stored.conversation", where: "settings.stored.conversation.where" },
  { what: "settings.stored.server", where: "settings.stored.server.where" },
];

export default function SettingsPage() {
  return (
    <PageContainer width="medium">
      <PageHeader
        eyebrow={<T k="settings.eyebrow" />}
        title={<T k="nav.settings" />}
        description={<T k="settings.description" values={{ name: BRAND.name }} />}
      />

      <div className="border-b border-rule">
        <SettingsRow id="appearance" title="settings.appearance" description="settings.appearance.description">
          <ThemeSelector />
        </SettingsRow>

        <SettingsRow id="language" title="prefs.language" description="settings.language.description">
          <LanguageSelector showNote />
        </SettingsRow>

        <SettingsRow id="reading" title="settings.reading" description="settings.reading.description">
          <ReadingSettings showNote />
        </SettingsRow>

        <SettingsRow id="reflections" title="settings.reflections" description="settings.reflections.description">
          <ReflectionSettings />
        </SettingsRow>

        <SettingsRow id="privacy" title="footer.privacy" description="settings.privacy.description">
          <dl className="divide-y divide-rule border-y border-rule">
            {STORED.map((item) => (
              <div key={item.what} className="grid gap-1 py-3.5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
                <dt className="text-sm font-medium text-ink">
                  <T k={item.what} />
                </dt>
                <dd className="text-sm leading-relaxed text-ink-soft">
                  <T k={item.where} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-muted">
            <T
              k="settings.privacy.more"
              values={{
                link: (
                  <Link href="/about#privacy" className={textLink}>
                    <T k="settings.privacy.link" />
                  </Link>
                ),
              }}
            />
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
  title: MessageKey;
  description: MessageKey;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-24 grid-cols-1 gap-x-12 gap-y-5 border-t border-rule py-10 md:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <div>
        <h2 id={`${id}-title`} className="display text-[1.875rem] leading-tight text-ink">
          <T k={title} />
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          <T k={description} />
        </p>
      </div>
      <div className="min-w-0 md:pt-1">{children}</div>
    </section>
  );
}
