/**
 * Placeholder shown while a page's data streams in. The shapes roughly match
 * the content they stand for, which keeps the layout from jumping.
 */
export function LoadingState({
  label = "Loading",
  variant = "page",
}: {
  label?: string;
  variant?: "page" | "cards" | "verse" | "list";
}) {
  return (
    <div role="status" aria-live="polite" className="py-2">
      <span className="sr-only">{label}…</span>
      <div aria-hidden>
        {variant === "page" && (
          <div className="space-y-4 pt-10">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-10 w-3/5" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton mt-10 h-56 w-full rounded-2xl" />
          </div>
        )}
        {variant === "verse" && (
          <div className="space-y-4">
            <div className="skeleton h-72 w-full rounded-2xl" />
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-24 w-full rounded-xl" />
          </div>
        )}
        {variant === "cards" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        )}
        {variant === "list" && (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
