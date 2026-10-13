import { Suspense } from "react";

import { AskLink } from "./AskLink";
import { Wordmark } from "./brand/Wordmark";
import { HeaderFrame } from "./HeaderFrame";
import { Icon } from "./Icon";
import { NavLinks } from "./NavLinks";
import { NavList } from "./NavList";

/** Frosted pill, shown on a floating control once the page has scrolled. */
const FROSTED_WHEN_SCROLLED =
  "group-data-[scrolled=true]/header:bg-paper/80 group-data-[scrolled=true]/header:shadow-card group-data-[scrolled=true]/header:ring-1 group-data-[scrolled=true]/header:ring-rule group-data-[scrolled=true]/header:backdrop-blur-xl";

export function SiteHeader() {
  return (
    <HeaderFrame>
      {/* Spans the page shell; the name's mark lines up with the page's gutter. */}
      <div className="mx-auto flex h-16 max-w-(--shell) items-center gap-3 px-[calc(var(--page-x)-0.5rem)]">
        <AskLink
          className={`pointer-events-auto flex items-center rounded-full py-1.5 pr-4 pl-2 transition-[background-color,box-shadow] duration-300 ${FROSTED_WHEN_SCROLLED}`}
        >
          <Wordmark />
        </AskLink>
        {/* The current page is only known at request time on dynamic routes; the
            plain navigation is prerendered as the fallback. */}
        <Suspense fallback={<NavFallback />}>
          <NavLinks />
        </Suspense>
      </div>
    </HeaderFrame>
  );
}

function NavFallback() {
  return (
    <>
      <NavList />
      <div className="pointer-events-auto ml-auto md:hidden">
        <span className="flex size-11 items-center justify-center rounded-full bg-paper/75 text-ink shadow-card ring-1 ring-rule backdrop-blur-xl">
          <Icon name="menu" className="size-5" />
        </span>
      </div>
    </>
  );
}
