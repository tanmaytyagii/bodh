import Form from "next/form";

import { Icon } from "./Icon";

export function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <Form action="/explore" role="search" className="group relative">
      <label htmlFor="q" className="sr-only">
        Search the texts
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-ink-muted transition-colors group-focus-within:text-accent"
      />
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={500}
        placeholder="Search the texts…"
        className="h-16 w-full rounded-full bg-surface-raised pr-32 pl-13 text-[1.0625rem] text-ink shadow-raised ring-1 ring-field transition-[box-shadow] placeholder:text-ink-muted focus:ring-2 focus:ring-accent focus:outline-none"
      />
      <button
        type="submit"
        className="absolute top-1/2 right-2 inline-flex h-12 -translate-y-1/2 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover"
      >
        Search
      </button>
    </Form>
  );
}
