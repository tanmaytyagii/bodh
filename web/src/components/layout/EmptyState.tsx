import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/Icon";

export function EmptyState({
  icon,
  title,
  children,
  actions,
  headingLevel = 2,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="flex flex-col items-center rounded-[2rem] bg-surface-sunk/70 px-6 py-14 text-center sm:py-20">
      {icon && (
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-raised text-accent shadow-card ring-1 ring-rule">
          <Icon name={icon} className="size-6" />
        </span>
      )}
      <Heading className="display mt-5 text-[2rem] leading-tight text-balance text-ink">{title}</Heading>
      {children && <div className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-pretty text-ink-soft">{children}</div>}
      {actions && <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
