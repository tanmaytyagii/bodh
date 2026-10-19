"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { downloadReflection, downloadReflections } from "@/lib/download";
import { useT } from "@/lib/i18n/useLocale";
import {
  isSavedPassage,
  isSavedText,
  reflectionsStore,
  type SavedItem,
  type SavedPassage,
  type SavedReflection,
  type SavedText,
} from "@/lib/reflections";
import { useHydrated } from "@/lib/useHydrated";
import { buttonClass } from "@/lib/ui";

import { AnswerPanel } from "./ask/AnswerPanel";
import { ConfirmButton } from "./ConfirmButton";
import { T } from "./i18n/T";
import { Icon } from "./Icon";
import { Label } from "./Label";
import { EmptyState } from "./layout/EmptyState";
import { LoadingState } from "./layout/LoadingState";
import { ImportReflections } from "./reflections/ImportReflections";
import { VerseCard } from "./VerseCard";

export function ReflectionsList() {
  const hydrated = useHydrated();
  const t = useT();
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  const [open, setOpen] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  // Saved items live in this browser, so the server cannot know them.
  if (!hydrated) return <LoadingState label={t("reflections.loading")} variant="list" />;

  // One toolbar for both states, so an import started on an empty page keeps
  // its confirmation and its Undo once the reflections appear.
  return (
    <div>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${items.length ? "border-b border-rule pb-5" : "pb-2"}`}
      >
        <p aria-live="polite" className="text-sm text-ink-muted">
          {deleted ? (
            <T k="reflections.deleted" />
          ) : items.length ? (
            <T k={items.length === 1 ? "reflections.count.one" : "reflections.count.other"} values={{ count: items.length }} />
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ImportReflections />
          {items.length > 0 && (
            <button type="button" onClick={() => downloadReflections(items)} className={buttonClass("secondary", "sm")}>
              <Icon name="download" className="size-4" />
              <T k="reflections.exportAll" />
            </button>
          )}
        </div>
      </div>
      {items.length ? (
        <ol className="divide-y divide-rule">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              expanded={open === item.id}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onDelete={() => {
                reflectionsStore.remove(item.id);
                setDeleted(true);
              }}
            />
          ))}
        </ol>
      ) : (
        <EmptyState
          icon="bookmark"
          title={<T k="reflections.empty.title" />}
          actions={
            <Link href="/" className={buttonClass("primary", "md")}>
              <T k="reflections.empty.ask" />
              <Icon name="arrowRight" className="size-4" />
            </Link>
          }
        >
          <T k="reflections.empty.body" />
        </EmptyState>
      )}
    </div>
  );
}

function ItemRow(props: { item: SavedItem; expanded: boolean; onToggle: () => void; onDelete: () => void }) {
  const { item } = props;
  if (isSavedPassage(item)) return <PassageItem {...props} item={item} />;
  if (isSavedText(item)) return <TextItem {...props} item={item} />;
  return <AnswerItem {...props} item={item} />;
}

/** The date, and what the item rests on, in the left column. */
function Margin({ savedAt, children }: { savedAt: string; children?: ReactNode }) {
  return (
    <div className="text-xs leading-relaxed text-ink-muted">
      <time dateTime={savedAt} className="eyebrow block">
        {new Date(savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </time>
      {children}
    </div>
  );
}

function Notes({ item }: { item: SavedItem }) {
  const t = useT();
  const noteId = `note-${item.id}`;
  // A note this browser would not store stays in the box, and the page says so.
  const [failed, setFailed] = useState(false);
  return (
    <>
      <label htmlFor={noteId} className="eyebrow mt-7 block text-ink-muted">
        <T k="reflections.notes" />
      </label>
      <textarea
        id={noteId}
        defaultValue={item.note}
        onBlur={(e) => setFailed(!reflectionsStore.updateNote(item.id, e.target.value))}
        aria-describedby={failed ? `${noteId}-failed` : undefined}
        rows={3}
        placeholder={t("reflections.notes.placeholder")}
        className="mt-2 w-full rounded-2xl bg-surface-raised p-4 text-[0.9375rem] leading-relaxed text-ink ring-1 ring-field placeholder:text-ink-muted focus:ring-2 focus:ring-accent focus:outline-none"
      />
      {failed && (
        <p id={`${noteId}-failed`} role="alert" className="mt-2 text-sm text-danger">
          <T k="reflections.notes.failed" />
        </p>
      )}
    </>
  );
}

function Actions({ item, onDelete, children }: { item: SavedItem; onDelete: () => void; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1">
      {children}
      <button type="button" onClick={() => downloadReflection(item)} className={buttonClass("ghost", "sm")}>
        <Icon name="download" className="size-4" />
        <T k="reflections.export" />
      </button>
      <ConfirmButton
        className={buttonClass("ghost", "sm", "text-danger hover:bg-danger-bg hover:text-danger")}
        title={t("reflections.delete.title")}
        description={t("reflections.delete.body")}
        confirmLabel={t("reflections.delete")}
        onConfirm={onDelete}
      >
        <Icon name="trash" className="size-4" />
        <T k="reflections.delete" />
      </ConfirmButton>
    </div>
  );
}

function AnswerItem({
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
  return (
    <li className="reveal grid grid-cols-1 gap-x-12 gap-y-4 py-10 md:grid-cols-[9rem_minmax(0,1fr)]">
      <Margin savedAt={item.savedAt}>{refs && <p className="mt-2 font-medium text-source">{refs}</p>}</Margin>
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
        <Notes item={item} />
        <Actions item={item} onDelete={onDelete}>
          <button type="button" onClick={onToggle} className={buttonClass("ghost", "sm")} aria-expanded={expanded}>
            <Icon name={expanded ? "chevronDown" : "chevronRight"} className="size-4" />
            <T k={expanded ? "reflections.hideAnswer" : "reflections.showAnswer"} />
          </button>
        </Actions>
        {expanded && (
          <div className="mt-8 border-t border-rule pt-8">
            <AnswerPanel question={item.question} answer={item.answer} layout="inline" />
          </div>
        )}
      </div>
    </li>
  );
}

function PassageItem({ item, onDelete }: { item: SavedPassage; onDelete: () => void }) {
  return (
    <li className="reveal grid grid-cols-1 gap-x-12 gap-y-4 py-10 md:grid-cols-[9rem_minmax(0,1fr)]">
      <Margin savedAt={item.savedAt}>
        <p className="mt-2 font-medium text-source">
          <T k="reflections.passage" />
        </p>
      </Margin>
      <div className="min-w-0">
        <div className="-mt-7">
          <VerseCard passage={item.passage} variant="plain" headingLevel={2} />
        </div>
        <Notes item={item} />
        <Actions item={item} onDelete={onDelete} />
      </div>
    </li>
  );
}

/** A reflection from an older export, kept as the text it was. */
function TextItem({ item, expanded, onToggle, onDelete }: { item: SavedText; expanded: boolean; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className="reveal grid grid-cols-1 gap-x-12 gap-y-4 py-10 md:grid-cols-[9rem_minmax(0,1fr)]">
      <Margin savedAt={item.savedAt}>
        <p className="mt-2">
          <Label kind="editorial">
            <T k="reflections.imported" />
          </Label>
        </p>
      </Margin>
      <div className="min-w-0">
        <h2 className="display text-[1.75rem] leading-snug text-pretty text-ink">{item.question}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          <T k="reflections.imported.note" />
        </p>
        <Notes item={item} />
        <Actions item={item} onDelete={onDelete}>
          <button type="button" onClick={onToggle} className={buttonClass("ghost", "sm")} aria-expanded={expanded}>
            <Icon name={expanded ? "chevronDown" : "chevronRight"} className="size-4" />
            <T k={expanded ? "reflections.hideText" : "reflections.showText"} />
          </button>
        </Actions>
        {expanded && (
          <div className="mt-6 max-h-[32rem] overflow-y-auto rounded-2xl bg-surface-sunk/60 p-5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink-soft ring-1 ring-rule">
            {item.body}
          </div>
        )}
      </div>
    </li>
  );
}
