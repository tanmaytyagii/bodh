import type { Provenance } from "@/lib/types";

import { Icon } from "./Icon";

const STATES = {
  verified: { text: "Sanskrit cross-checked", tone: "text-ok", icon: "check" },
  reviewed: { text: "Variant reading — reviewed", tone: "text-ink-soft", icon: "check" },
  needs_review: { text: "Variant reading — under review", tone: "text-warn", icon: "alert" },
  unverified: { text: "Translation only", tone: "text-ink-muted", icon: "info" },
} as const;

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const state = STATES[provenance.status];
  return (
    <span
      title={provenance.notes[0] ?? provenance.label}
      className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${state.tone}`}
    >
      <Icon name={state.icon} className="size-3.5" />
      {state.text}
    </span>
  );
}
