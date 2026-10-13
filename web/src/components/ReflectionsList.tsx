"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { downloadReflection, downloadReflections } from "@/lib/download";
import { reflectionsStore, type SavedReflection } from "@/lib/reflections";
import { useHydrated } from "@/lib/useHydrated";
import { buttonClass } from "@/lib/ui";

import { AnswerPanel } from "./ask/AnswerPanel";
import { ConfirmButton } from "./ConfirmButton";
import { Icon } from "./Icon";
import { EmptyState } from "./layout/EmptyState";
import { LoadingState } from "./layout/LoadingState";

export function ReflectionsList() {
  const hydrated = useHydrated();
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  // Saved items live in this browser, so the server cannot know them.
  if (!hydrated) return <LoadingState label="Loading your reflections" variant="list" />;

  if (!items.length) {
    return (
      <>
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
        <EmptyState
          icon="bookmark"
          title="Nothing saved yet"
          actions={
            <Link href="/" className={buttonClass("primary", "md")}>
              Ask a question
              <Icon name="arrowRight" className="size-4" />
            </Link>
          }
        >
          After an answer, choose “Save this reflection” to keep it here, with room for your own notes. It stays in
          this browser only.
        </EmptyState>
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-5">
        <p aria-live="polite" className="text-sm text-ink-muted">
          {status || `${items.length} saved reflection${items.length === 1 ? "" : "s"}`}
        </p>
        <button type="button" onClick={() => downloadReflections(items)} className={buttonClass("secondary", "sm")}>
          <Icon name="download" className="size-4" />
          Export all (Markdown)
        </button>
      </div>
      <ol className="divide-y divide-rule">
        {items.map((item) => (
          <ReflectionItem
            key={item.id}
            item={item}
            expanded={open === item.id}
            onToggle={() => setOpen(open === item.id ? null : item.id)}
            onDelete={() => {
              reflectionsStore.remove(item.id);
              setStatus("Reflection deleted.");
            }}
          />
        ))}
      </ol>
    </div>
  );
}

function ReflectionItem({
  item,
  expanded,
  onToggle,
  onDelete,
}: {
  item: SavedReflection;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const refs = item.answer.teachings.map((t) => t.passage.short_ref).join(", ");
  const noteId = `note-${item.id}`;
  return (
    <li className="reveal grid grid-cols-1 gap-x-12 gap-y-4 py-10 md:grid-cols-[9rem_minmax(0,1fr)]">
      <div className="text-xs leading-relaxed text-ink-muted">
        <time dateTime={item.savedAt} className="eyebrow block">
          {new Date(item.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </time>
        {refs && <p className="mt-2 font-medium text-source">{refs}</p>}
      </div>
      <div className="min-w-0">
        <h2 className="display text-[1.75rem] leading-snug text-pretty text-ink">{item.question}</h2>
        {item.answer.reflective_question && (
          <figure className="relative mt-5 pl-8">
            <span aria-hidden className="display absolute -top-2 left-0 text-[2.75rem] leading-none text-gold">
              “
            </span>
            <p className="font-serif text-[1.0625rem] leading-relaxed text-ink-soft italic">
              {item.answer.reflective_question.replace(/\[\[[^\]]*\]\]/g, "")}
            </p>
          </figure>
        )}
        <label htmlFor={noteId} className="eyebrow mt-7 block text-ink-muted">
          Your notes
        </label>
        <textarea
          id={noteId}
          defaultValue={item.note}
          onBlur={(e) => reflectionsStore.updateNote(item.id, e.target.value)}
          rows={3}
          placeholder="What do you notice when you sit with the question?"
          className="mt-2 w-full rounded-2xl bg-surface-raised p-4 text-[0.9375rem] leading-relaxed text-ink ring-1 ring-field placeholder:text-ink-muted focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <div className="mt-4 flex flex-wrap items-center gap-1">
          <button type="button" onClick={onToggle} className={buttonClass("ghost", "sm")} aria-expanded={expanded}>
            <Icon name={expanded ? "chevronDown" : "chevronRight"} className="size-4" />
            {expanded ? "Hide answer" : "Show answer"}
          </button>
          <button
            type="button"
            onClick={() => downloadReflection(item)}
            className={buttonClass("ghost", "sm")}
          >
            <Icon name="download" className="size-4" />
            Export
          </button>
          <ConfirmButton
            className={buttonClass("ghost", "sm", "text-danger hover:bg-danger-bg hover:text-danger")}
            title="Delete this reflection?"
            description="The saved answer and your notes will be removed from this browser. This cannot be undone."
            confirmLabel="Delete"
            onConfirm={onDelete}
          >
            <Icon name="trash" className="size-4" />
            Delete
          </ConfirmButton>
        </div>
        {expanded && (
          <div className="mt-8 border-t border-rule pt-8">
            <AnswerPanel question={item.question} answer={item.answer} layout="inline" />
          </div>
        )}
      </div>
    </li>
  );
}
