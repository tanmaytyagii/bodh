"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/useLocale";
import { reflectionsStore } from "@/lib/reflections";
import type { Answer } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

function useSaved(answerId: string): boolean {
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  return items.some((item) => item.id === answerId);
}

/**
 * The answer's one Save, in its toolbar: keeps it in this browser, with room
 * for notes. Once saved, it becomes a link to your reflections.
 */
export function SaveButton({ question, answer }: { question: string; answer: Answer }) {
  const saved = useSaved(answer.id);
  const t = useT();
  // When this browser will not store it, the button says so, and can be pressed again.
  const [failed, setFailed] = useState(false);
  return saved ? (
    <Link href="/reflections" className={buttonClass("ghost", "sm", "text-ok hover:text-ok")}>
      <Icon name="bookmarkCheck" className="size-4" />
      <T k="save.saved" />
    </Link>
  ) : (
    <>
      <button
        type="button"
        onClick={() => setFailed(!reflectionsStore.save(question, answer))}
        className={buttonClass("secondary", "sm", failed ? "bg-paper/70 text-danger" : "bg-paper/70")}
        aria-label={t("save.label")}
        title={t(failed ? "save.failed" : "save.hint")}
      >
        <Icon name={failed ? "alert" : "bookmark"} className="size-4" />
        <T k={failed ? "save.failed.short" : "save.save"} />
      </button>
      <span role="alert" className="sr-only">
        {failed && <T k="save.failed" />}
      </span>
    </>
  );
}

/** Where a saved answer is kept, shown with its sources once it has been saved. */
export function SavedStatus({ answer }: { answer: Answer }) {
  const saved = useSaved(answer.id);
  if (!saved) return null;
  return (
    <span className="inline-flex h-9 items-center gap-1.5 text-[0.8125rem] text-ok">
      <Icon name="bookmarkCheck" className="size-4" />
      <T
        k="save.status"
        values={{
          link: (
            <Link href="/reflections" className="font-medium underline underline-offset-2">
              <T k="save.yourReflections" />
            </Link>
          ),
        }}
      />
    </span>
  );
}
