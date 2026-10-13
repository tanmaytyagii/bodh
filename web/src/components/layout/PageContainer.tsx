import type { ReactNode } from "react";

const WIDTHS = {
  reading: "max-w-reading",
  medium: "max-w-[54rem]",
  page: "max-w-page",
  wide: "max-w-[96rem]",
  narrow: "max-w-2xl",
} as const;

/** The horizontal frame every page sits in: a max width, and the site's fluid gutters (--page-x). */
export function PageContainer({
  width = "page",
  className = "",
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`relative mx-auto w-full ${WIDTHS[width]} px-(--page-x) ${className}`}>{children}</div>;
}
