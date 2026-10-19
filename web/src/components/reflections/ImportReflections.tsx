"use client";

import { useEffect, useId, useRef, useState } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import type { MessageKey } from "@/lib/i18n/messages";
import { ImportError, MAX_IMPORT_BYTES, parseReflectionsFile, type ImportProblem, type ImportResult } from "@/lib/reflectionImport";
import { isSavedPassage, isSavedText, reflectionsStore, type SavedItem } from "@/lib/reflections";
import { buttonClass } from "@/lib/ui";

const PROBLEM: Record<ImportProblem | "tooLarge", MessageKey> = {
  tooLarge: "import.error.tooLarge",
  empty: "import.error.empty",
  notAnExport: "import.error.notAnExport",
  newerVersion: "import.error.newerVersion",
  unreadable: "import.error.unreadable",
};

interface Preview {
  result: ImportResult;
  /** Items not already in this browser: the ones that would be added. */
  fresh: SavedItem[];
  existing: number;
}

function itemTitle(item: SavedItem): string {
  if (isSavedPassage(item)) return item.passage.ref;
  return item.question;
}

/**
 * Import reflections from an exported file. Nothing is added until you have
 * seen what the file holds and confirmed: reflections already here are left
 * as they are (never overwritten), entries that are not valid are left out
 * and counted, and an import can be undone straight afterwards.
 */
export function ImportReflections() {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<{ key: MessageKey; values?: Record<string, number> } | null>(null);
  const [undo, setUndo] = useState<string[] | null>(null);

  async function read(file: File) {
    setStatus(null);
    setUndo(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus({ key: PROBLEM.tooLarge });
      return;
    }
    try {
      const result = parseReflectionsFile(await file.text());
      const known = new Set(reflectionsStore.getSnapshot().map((item) => item.id));
      const fresh = result.items.filter((item) => !known.has(item.id));
      setPreview({ result, fresh, existing: result.items.length - fresh.length });
    } catch (error) {
      setStatus({ key: PROBLEM[error instanceof ImportError ? error.problem : "unreadable"] });
    }
  }

  // Opened once the preview is in it, so focus lands on its first button.
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
  }, [preview]);

  function confirm() {
    if (!preview) return;
    const before = new Set(reflectionsStore.getSnapshot().map((item) => item.id));
    const added = reflectionsStore.addMany(preview.fresh);
    if (added === null) {
      setStatus({ key: "import.error.storage" });
      dialog.current?.close();
      return;
    }
    setUndo(preview.fresh.map((item) => item.id).filter((id) => !before.has(id)));
    setStatus({ key: preview.existing ? "import.done" : "import.done.all", values: { added, existing: preview.existing } });
    dialog.current?.close();
  }

  function undoImport() {
    for (const id of undo ?? []) reflectionsStore.remove(id);
    setUndo(null);
    setStatus({ key: "import.undone" });
  }

  const counts = preview
    ? {
        answers: preview.fresh.filter((item) => !isSavedPassage(item) && !isSavedText(item)).length,
        passages: preview.fresh.filter(isSavedPassage).length,
        texts: preview.fresh.filter(isSavedText).length,
      }
    : null;

  return (
    <>
      <button type="button" onClick={() => input.current?.click()} className={buttonClass("secondary", "sm")}>
        <Icon name="upload" className="size-4" />
        <T k="import.button" />
      </button>
      <input
        ref={input}
        type="file"
        accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void read(file);
        }}
      />
      {status && (
        <p
          role={status.key.startsWith("import.error") ? "alert" : "status"}
          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm ${status.key.startsWith("import.error") ? "text-danger" : "text-ink-soft"}`}
        >
          <span>
            <T k={status.key} values={status.values} />
          </span>
          {undo && undo.length > 0 && (
            <button type="button" onClick={undoImport} className="font-medium text-ink underline underline-offset-2">
              <T k="import.undo" />
            </button>
          )}
        </p>
      )}

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setPreview(null)}
        className="m-auto w-[min(94vw,34rem)] rounded-2xl border border-rule bg-surface-raised p-0 text-ink shadow-overlay backdrop:bg-black/50"
      >
        {preview && counts && (
          <div className="p-6">
            <h2 id={titleId} className="font-serif text-xl font-semibold">
              <T k={preview.fresh.length ? "import.preview.title" : "import.preview.nothing"} values={{ count: preview.fresh.length }} />
            </h2>
            <ul className="mt-4 space-y-1.5 text-[0.9375rem] text-ink-soft">
              {counts.answers > 0 && (
                <li>
                  <T k="import.preview.answers" values={{ count: counts.answers }} />
                </li>
              )}
              {counts.passages > 0 && (
                <li>
                  <T k="import.preview.passages" values={{ count: counts.passages }} />
                </li>
              )}
              {counts.texts > 0 && (
                <li>
                  <T k="import.preview.texts" values={{ count: counts.texts }} />
                </li>
              )}
              {preview.existing > 0 && (
                <li className="text-ink-muted">
                  <T k="import.preview.existing" values={{ count: preview.existing }} />
                </li>
              )}
              {preview.result.invalid > 0 && (
                <li className="text-ink-muted">
                  <T k="import.preview.invalid" values={{ count: preview.result.invalid }} />
                </li>
              )}
            </ul>
            {preview.result.source === "markdown" && preview.fresh.length > 0 && (
              <p className="mt-4 rounded-xl bg-info-bg px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <T k="import.preview.legacy" />
              </p>
            )}
            {preview.fresh.length > 0 && (
              <ol className="mt-4 max-h-48 space-y-1 overflow-y-auto border-y border-rule py-3 text-sm text-ink">
                {preview.fresh.slice(0, 20).map((item) => (
                  <li key={item.id} className="truncate">
                    <span className="text-ink-muted tabular-nums">{new Date(item.savedAt).toLocaleDateString()}</span> ·{" "}
                    {itemTitle(item)}
                  </li>
                ))}
                {preview.fresh.length > 20 && (
                  <li className="text-ink-muted">
                    <T k="import.preview.more" values={{ count: preview.fresh.length - 20 }} />
                  </li>
                )}
              </ol>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("ghost", "md")}>
                <T k="feedback.cancel" />
              </button>
              <button type="button" onClick={confirm} disabled={!preview.fresh.length} className={buttonClass("primary", "md")}>
                <Icon name="upload" className="size-4" />
                <T k="import.confirm" values={{ count: preview.fresh.length }} />
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
