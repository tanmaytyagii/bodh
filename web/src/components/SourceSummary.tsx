import type { Source } from "@/lib/types";

import { T } from "./i18n/T";

/** How much of a source there is: "700 verses · 18 chapters". */
export function SourceSummary({ source }: { source: Source }) {
  const parts = source.division_label.toLowerCase() === "chapter" ? "explore.summary.chapters" : "explore.summary.parts";
  return (
    <>
      <T k="explore.summary.verses" values={{ count: source.passage_count }} />
      {source.divisions.length > 1 && (
        <>
          {" · "}
          <T k={parts} values={{ count: source.divisions.length }} />
        </>
      )}
    </>
  );
}
