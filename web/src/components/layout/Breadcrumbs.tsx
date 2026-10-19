import Link from "next/link";
import type { ReactNode } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-labelledby="breadcrumb-label" className="text-sm">
      <span id="breadcrumb-label" className="sr-only">
        <T k="nav.breadcrumb" />
      </span>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink-muted">
        {items.map((item, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <Icon name="chevronRight" className="size-3.5 opacity-60" />}
            {item.href ? (
              <Link href={item.href} className="rounded transition-colors hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink-soft">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
