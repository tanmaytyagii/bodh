import type { Passage } from "@/lib/types";
import { panelHeading } from "@/lib/ui";

import { FeedbackButton } from "./FeedbackButton";
import { T } from "./i18n/T";
import { Icon } from "./Icon";

const LINK =
  "inline-flex items-center gap-1.5 font-medium text-ink underline decoration-rule-strong underline-offset-[3px] transition-colors hover:decoration-accent";

/**
 * Where a passage comes from and how it was checked, laid out as a colophon:
 * citation and links; the Sanskrit check; corrections and reporting.
 */
export function SourceMetadata({ passage }: { passage: Passage }) {
  return (
    <section aria-labelledby="provenance" className="text-sm leading-relaxed text-ink-soft">
      <h2 id="provenance" className="display flex items-center gap-3 text-[clamp(2rem,3vw,2.5rem)] leading-tight text-ink">
        <Icon name="shieldCheck" className="size-6 text-ok" />
        <T k="source.title" />
      </h2>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <p>
            <span className="font-medium text-ink">
              <T k="source.citeAs" />
            </span>{" "}
            {passage.citation.label}.
          </p>
          <ul className="mt-3 space-y-1.5">
            <li>
              <a href={passage.citation.url} target="_blank" rel="noreferrer" className={LINK}>
                <T k="source.transcription" /> ↗
              </a>
            </li>
            {passage.citation.scan_url && (
              <li>
                <a href={passage.citation.scan_url} target="_blank" rel="noreferrer" className={LINK}>
                  <T k="source.scan" /> ↗
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h3 className={panelHeading}>
            <T k={passage.sanskrit ? "source.sanskritCheck" : "source.checks"} />
          </h3>
          <p className="mt-1.5">
            {passage.sanskrit ? passage.provenance.label : (passage.provenance.notes[0] ?? passage.provenance.label)}.
          </p>
          {passage.provenance.status === "reviewed" && <p className="mt-1">{passage.provenance.notes[0]}</p>}
          {passage.provenance.cross_checks.map((check, i) => (
            <div key={i} className="mt-2">
              <p>
                <T k="source.compared" values={{ edition: check.edition, status: <span className="font-medium text-ink">{check.status}</span> }} />
                {check.status === "orthographic" && (
                  <>
                    {" "}
                    <T k="source.orthographic" />
                  </>
                )}
              </p>
              {check.detail && (
                <p className="mt-1.5 rounded-lg bg-surface-sunk px-3 py-2">
                  <T k="source.differs" />{" "}
                  <span lang="sa" className="deva text-ink">
                    {check.detail}
                  </span>
                </p>
              )}
            </div>
          ))}
          {passage.transliteration_note && <p className="mt-3 text-xs text-ink-muted">{passage.transliteration_note}.</p>}
        </div>

        <div>
          {passage.corrections.length > 0 && (
            <details className="group mb-5">
              <summary className="flex items-center gap-1.5 font-medium text-ink">
                <Icon name="chevronRight" className="size-4 transition-transform group-open:rotate-90" />
                <T k="source.corrections" values={{ count: passage.corrections.length }} />
              </summary>
              <ul className="mt-2 space-y-2 pl-5">
                {passage.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{c.field}:</span> <T k="source.printed" values={{ printed: c.printed }} />{" "}
                    {c.applied ? <T k="source.shownAs" values={{ corrected: c.corrected }} /> : <T k="source.keptAsPrinted" />}. {c.basis}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mb-3">
            <T k="source.wrong" />
          </p>
          <FeedbackButton passageId={passage.id} label="source.report" />
        </div>
      </div>
    </section>
  );
}
