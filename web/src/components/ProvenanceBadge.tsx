import type { Provenance } from "@/lib/types";

import { T } from "./i18n/T";
import { Icon } from "./Icon";

const STATES = {
  verified: { text: "provenance.verified", tone: "text-ok", icon: "check" },
  reviewed: { text: "provenance.reviewed", tone: "text-ink-soft", icon: "check" },
  needs_review: { text: "provenance.needs_review", tone: "text-warn", icon: "alert" },
  unverified: { text: "provenance.unverified", tone: "text-ink-muted", icon: "info" },
} as const;

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const state = STATES[provenance.status];
  return (
    <span
      title={provenance.notes[0] ?? provenance.label}
      className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${state.tone}`}
    >
      <Icon name={state.icon} className="size-3.5" />
      <T k={state.text} />
    </span>
  );
}
