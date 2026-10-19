import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import type { PassageMatch } from "@/lib/types";

/**
 * Why search brought a passage up, in plain words: the passage asked about,
 * one cited earlier in the conversation, a match on the romanized Sanskrit,
 * the editorial themes that led to it, the words of its translation that
 * matched, or closeness in meaning. Only what retrieval actually recorded;
 * without any of it, simply "found by search". It explains relevance, never
 * authority, so it is set apart from the passage and from any interpretation.
 */
export function MatchNote({ match }: { match?: PassageMatch }) {
  const reasons: ReactNode[] = [];
  if (match?.asked_about) reasons.push(<T k="match.asked" />);
  if (match?.from_conversation) reasons.push(<T k="match.earlier" />);
  if (match?.sanskrit) reasons.push(<T k="match.sanskrit" />);
  if (match?.themes.length) {
    const themes = match.themes.map((theme, i) => (
      <Fragment key={theme.id}>
        {i > 0 && ", "}
        <Link href={`/concepts/${theme.id}`} className="text-ink-soft underline decoration-rule-strong underline-offset-2 hover:text-ink">
          {theme.name}
        </Link>
      </Fragment>
    ));
    reasons.push(<T k={match.themes.length === 1 ? "match.theme.one" : "match.theme.other"} values={{ themes }} />);
  }
  if (match?.words.length) {
    reasons.push(<T k="match.words" values={{ words: match.words.map((w) => `“${w}”`).join(", ") }} />);
  }
  if (match?.semantic && !match.words.length) reasons.push(<T k="match.semantic" />);
  if (!reasons.length) reasons.push(<T k="match.search" />);

  return (
    <p className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-snug text-ink-muted">
      <Icon name="search" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-ink-soft">
          <T k="match.why" />
        </span>{" "}
        {reasons.map((reason, i) => (
          <Fragment key={i}>
            {i > 0 && " · "}
            {reason}
          </Fragment>
        ))}
      </span>
    </p>
  );
}
