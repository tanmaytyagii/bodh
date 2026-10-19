import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import { Both, T } from "@/components/i18n/T";
import { Label } from "@/components/Label";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSources } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { MessageKey } from "@/lib/i18n/messages";
import { panelHeading, textLink } from "@/lib/ui";

export const metadata: Metadata = {
  title: "About",
  description: `What ${BRAND.name} means, how its answers are made, where the texts come from, and what it is not.`,
};

const SECTIONS: { id: string; title: MessageKey }[] = [
  { id: "method", title: "about.method" },
  { id: "sources", title: "about.sources" },
  { id: "privacy", title: "footer.privacy" },
  { id: "limits", title: "about.limits" },
];

const STEPS: { title: MessageKey; text: MessageKey }[] = [
  { title: "about.step.safety", text: "about.step.safety.text" },
  { title: "about.step.understanding", text: "about.step.understanding.text" },
  { title: "about.step.retrieval", text: "about.step.retrieval.text" },
  { title: "about.step.reply", text: "about.step.reply.text" },
  { title: "about.step.verification", text: "about.step.verification.text" },
];

const LIMITS: MessageKey[] = ["about.limit.authority", "about.limit.help", "about.limit.commentary", "about.limit.measured"];

export default function AboutPage() {
  const gita1863 = (
    <Link href="/scripture/bhagavad-gita/18/63" className={textLink}>
      18.63
    </Link>
  );
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={<T k="footer.about" values={{ name: BRAND.name }} />}
        title={<T k="about.title" />}
        description={
          <>
            <p className="max-w-2xl">
              <Both
                en={
                  <>
                    {BRAND.devanagari ? (
                      <>
                        {BRAND.name} (<span lang="hi">{BRAND.devanagari}</span>) means understanding: awareness,
                        discernment, insight. It is a tool
                      </>
                    ) : (
                      <>{BRAND.name} is a tool</>
                    )}{" "}
                    for thinking through real situations with the Bhagavad Gita and the Upanishads. Its guiding
                    principle comes from the end of the Gita itself: after the whole teaching, Krishna tells Arjuna to
                    reflect on it fully and then act as he chooses ({gita1863}). Wisdom should help you exercise better
                    judgement — not hand your judgement to a machine.
                  </>
                }
                hi={
                  <>
                    {BRAND.devanagari ? (
                      <>
                        {BRAND.name} ({BRAND.devanagari}) का अर्थ है समझ: जागरूकता, विवेक, अंतर्दृष्टि। यह एक साधन है
                      </>
                    ) : (
                      <>{BRAND.name} एक साधन है</>
                    )}{" "}
                    जिसके सहारे भगवद्गीता और उपनिषदों के साथ जीवन की वास्तविक परिस्थितियों पर विचार किया जा सके। इसका
                    मार्गदर्शक सिद्धांत स्वयं गीता के अंत से आता है: पूरी शिक्षा के बाद कृष्ण अर्जुन से कहते हैं कि इस
                    पर भली-भाँति विचार करो और फिर जैसा चाहो वैसा करो ({gita1863})। ज्ञान को आपके विवेक को बेहतर बनाने में
                    मदद करनी चाहिए — आपका विवेक किसी मशीन को सौंप देने में नहीं।
                  </>
                }
              />
            </p>
            <p className="display mt-8 text-[1.5rem] leading-snug text-ink">
              <T k="brand.philosophy" />
            </p>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-x-16 gap-y-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-labelledby="on-this-page" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <p id="on-this-page" className={panelHeading}>
            <T k="about.onThisPage" />
          </p>
          <ul className="mt-3 space-y-1 border-l border-rule">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px block border-l border-transparent py-1 pl-4 text-sm text-ink-muted transition-colors hover:border-accent hover:text-ink"
                >
                  <T k={section.title} />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-reading min-w-0">
          <Section id="method" title="about.method" first>
            <ol className="divide-y divide-rule border-y border-rule">
              {STEPS.map((step, i) => (
                <li key={step.title} className="reveal grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 py-5">
                  <span aria-hidden className="font-serif text-[1.75rem] leading-none text-gold tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">
                      <T k={step.title} />
                    </p>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">
                      <T k={step.text} />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <h3 className="mt-10 text-[0.9375rem] font-semibold text-ink">
              <T k="about.kinds" />
            </h3>
            <dl className="mt-3 divide-y divide-rule border-y border-rule">
              <KindRow label={<Label kind="source" />}>
                <T k="about.kind.source" />
              </KindRow>
              <KindRow label={<Label kind="note" />}>
                <T k="about.kind.note" />
              </KindRow>
              <KindRow label={<Label kind="editorial" />}>
                <T k="about.kind.editorial" />
              </KindRow>
              <KindRow label={<Label kind="ai" />}>
                <T k="about.kind.ai" />
              </KindRow>
            </dl>
          </Section>

          <Section id="sources" title="about.sources">
            <Suspense fallback={<div aria-hidden className="skeleton h-64 rounded-2xl" />}>
              <SourcesTable />
            </Suspense>
            <div className="mt-8 space-y-4">
              <p>
                <Both
                  en={
                    <>
                      <strong className="text-ink">Independent check.</strong> The Sanskrit of every verse of the Gita is
                      compared with a second digital edition (the open <GitaDataset /> dataset). 676 of 701 verses agree,
                      allowing for spelling conventions; the other 25 are shown as printed and flagged “under review”,
                      with the differing reading visible on the verse page. Transcribers’ corrections of misprints are
                      applied only where the second edition supports them, and every correction is recorded.
                    </>
                  }
                  hi={
                    <>
                      <strong className="text-ink">स्वतंत्र जाँच।</strong> गीता के हर श्लोक के संस्कृत पाठ की तुलना एक
                      दूसरे डिजिटल संस्करण (खुला <GitaDataset /> डेटासेट) से की जाती है। वर्तनी की परिपाटी को छोड़कर 701
                      में से 676 श्लोक मेल खाते हैं; शेष 25 जैसे छपे हैं वैसे ही दिखाए जाते हैं और “समीक्षाधीन” चिह्नित
                      रहते हैं, और भिन्न पाठ श्लोक के पृष्ठ पर दिखता है। प्रतिलिपिकारों द्वारा छपाई की भूलों के सुधार
                      केवल वहीं लागू होते हैं जहाँ दूसरा संस्करण उनका समर्थन करता है, और हर सुधार दर्ज किया जाता है।
                    </>
                  }
                />
              </p>
              <p>
                <Both
                  en={
                    <>
                      <strong className="text-ink">The Upanishads</strong> come from an edition that does not print the
                      Sanskrit, so those passages are marked “translation only”; the translator’s commentary on each verse
                      is shown as his notes.
                    </>
                  }
                  hi={
                    <>
                      <strong className="text-ink">उपनिषद</strong> ऐसे संस्करण से हैं जिसमें संस्कृत पाठ नहीं छपा है,
                      इसलिए उन अंशों पर “केवल अनुवाद” लिखा रहता है; हर श्लोक पर अनुवादक की व्याख्या उनकी टिप्पणियों के
                      रूप में दिखाई जाती है।
                    </>
                  }
                />
              </p>
              <p>
                <Both
                  en={
                    <>
                      <strong className="text-ink">Transliteration</strong> (IAST) is generated from the Devanagari, not
                      typed by hand. <strong className="text-ink">Chapter titles</strong> come from the edition’s own
                      colophons. This edition of the Gita counts 701 verses: it includes the opening verse of chapter 13
                      that some editions omit, so from 13.2 onwards its verse numbers are one higher than in those
                      editions.
                    </>
                  }
                  hi={
                    <>
                      <strong className="text-ink">लिप्यंतरण</strong> (IAST) देवनागरी से अपने-आप बनाया जाता है, हाथ से
                      टाइप नहीं किया जाता। <strong className="text-ink">अध्यायों के शीर्षक</strong> संस्करण की अपनी
                      पुष्पिकाओं से लिए गए हैं। गीता के इस संस्करण में 701 श्लोक हैं: इसमें अध्याय 13 का वह आरंभिक श्लोक
                      शामिल है जिसे कुछ संस्करण छोड़ देते हैं, इसलिए 13.2 से आगे इसकी श्लोक-संख्याएँ उन संस्करणों से एक
                      अधिक हैं।
                    </>
                  }
                />
              </p>
            </div>
          </Section>

          <Section id="privacy" title="footer.privacy">
            <p>
              <T k="about.privacy.body" />
            </p>
            <p className="mt-4">
              <T
                k="about.privacy.review"
                values={{
                  settings: (
                    <Link href="/settings" className={textLink}>
                      <T k="nav.settings" />
                    </Link>
                  ),
                }}
              />
            </p>
          </Section>

          <Section id="limits" title="about.limits">
            <ul className="divide-y divide-rule border-y border-rule">
              {LIMITS.map((item) => (
                <li key={item} className="flex gap-3 py-3.5">
                  <span aria-hidden className="mt-[0.6rem] size-1.5 shrink-0 rotate-45 bg-ink-muted" />
                  <span>
                    <T k={item} values={{ name: BRAND.name }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-2xl bg-surface-sunk px-5 py-4">
              <T
                k="about.support"
                values={{
                  tele: <strong className="text-ink">14416</strong>,
                  emergency: <strong className="text-ink">112</strong>,
                }}
              />
            </p>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function GitaDataset() {
  return (
    <a href="https://github.com/gita/gita" target="_blank" rel="noreferrer" className={textLink}>
      gita/gita
    </a>
  );
}

/** The editions behind each text, as served by the API. */
async function SourcesTable() {
  await connection();
  let sources;
  try {
    sources = (await getSources()) ?? [];
  } catch {
    return (
      <p>
        <T k="about.sources.error" />
      </p>
    );
  }
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {sources.map((source) => {
        const edition = source.editions.find((e) => e.role === "primary");
        return (
          <li key={source.id} className="reveal grid gap-x-8 gap-y-2 py-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div>
              <Link href={`/scripture/${source.id}`} className="display text-[1.375rem] leading-tight text-ink hover:underline">
                {source.title}
              </Link>
              <p className="mt-1 text-xs text-ink-muted">
                <T k="explore.summary.verses" values={{ count: source.passage_count }} />
              </p>
            </div>
            {edition && (
              <div className="min-w-0 text-[0.9375rem] leading-relaxed">
                <p className="text-ink">
                  {edition.title}
                  {edition.year ? ` (${edition.year})` : ""}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{edition.contributors}</p>
                <p className="mt-2 text-sm text-ink-soft">{edition.license}</p>
                <a
                  href={edition.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-accent"
                >
                  <T k="about.transcription" /> ↗
                </a>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ id, title, first, children }: { id: string; title: MessageKey; first?: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 ${first ? "" : "mt-20 border-t border-rule pt-12"}`}
    >
      <h2 id={`${id}-title`} className="display text-[2.25rem] leading-tight text-ink">
        <T k={title} />
      </h2>
      <div className="mt-6 text-base leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function KindRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
      <dt className="sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="text-[0.9375rem]">{children}</dd>
    </div>
  );
}
