import type { Resource } from "@/lib/types";

import { Icon } from "./Icon";

/** The first phone number in a contact line ("14416 or 1-800-891-4416" → "14416"). */
function phoneNumber(contact: string): { display: string; dial: string } | null {
  const match = /^\+?\d[\d\s-]{1,18}\d/.exec(contact.trim());
  return match ? { display: match[0], dial: match[0].replace(/[\s-]/g, "") } : null;
}

export function SafetyPanel({
  resources,
  message,
  urgent = false,
}: {
  resources: Resource[];
  message?: string | null;
  urgent?: boolean;
}) {
  return (
    <section
      aria-label="Support you can reach now"
      className={`rounded-[1.5rem] px-5 py-6 ring-1 sm:px-7 ${urgent ? "bg-danger-bg ring-danger/30" : "bg-warn-bg ring-warn/30"}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-raised ${urgent ? "text-danger" : "text-warn"}`}
        >
          <Icon name={urgent ? "phone" : "info"} className="size-[1.125rem]" />
        </span>
        <div className="min-w-0">
          <h2 className={`display text-[1.75rem] leading-tight ${urgent ? "text-danger" : "text-warn"}`}>
            {urgent ? "Please reach out to someone now" : "Support is available"}
          </h2>
          {message && <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">{message}</p>}
        </div>
      </div>
      <ul className={`mt-6 divide-y border-y ${urgent ? "divide-danger/20 border-danger/20" : "divide-warn/20 border-warn/20"}`}>
        {resources.map((resource) => {
          const phone = phoneNumber(resource.contact);
          return (
            <li key={resource.name} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold text-ink">{resource.name}</p>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-soft">{resource.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <p className="text-xl font-semibold tracking-tight text-ink tabular-nums">
                  {resource.url ? (
                    <a href={resource.url} target="_blank" rel="noreferrer" className="underline decoration-rule-strong underline-offset-4">
                      {resource.contact}
                    </a>
                  ) : (
                    resource.contact
                  )}
                </p>
                {phone && (
                  <a
                    href={`tel:${phone.dial}`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[0.8125rem] font-medium text-primary-ink sm:hidden"
                  >
                    <Icon name="phone" className="size-3.5" />
                    Call {phone.display}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
