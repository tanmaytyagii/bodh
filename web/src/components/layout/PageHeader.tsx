import type { ReactNode } from "react";

import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

/** Title block shared by every page: breadcrumbs, eyebrow, display title, description, actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  breadcrumbs,
  actions,
  meta,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="pt-10 pb-10 sm:pt-16 sm:pb-14">
      {breadcrumbs && (
        <div className="mb-8">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="max-w-3xl min-w-0">
          {eyebrow && (
            <div className="eyebrow mb-5 flex items-center gap-3 text-accent">
              <span aria-hidden className="h-px w-8 bg-current" />
              {eyebrow}
            </div>
          )}
          <h1 className="display text-[2.75rem] leading-[1.02] text-balance text-ink sm:text-title">{title}</h1>
          {meta && <div className="mt-4 text-sm text-ink-muted">{meta}</div>}
          {description && (
            <div className="mt-5 text-lg leading-relaxed text-pretty text-ink-soft">{description}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
