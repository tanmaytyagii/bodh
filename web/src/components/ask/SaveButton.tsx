"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Icon } from "@/components/Icon";
import { reflectionsStore } from "@/lib/reflections";
import type { Answer } from "@/lib/types";
import { buttonClass } from "@/lib/ui";

/** Saves an answer in this browser. "compact" is the short form for the answer's section bar. */
export function SaveButton({ question, answer, compact = false }: { question: string; answer: Answer; compact?: boolean }) {
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  const saved = items.some((item) => item.id === answer.id);
  if (compact) {
    return saved ? (
      <Link href="/reflections" className={buttonClass("ghost", "sm", "text-ok hover:text-ok")}>
        <Icon name="bookmarkCheck" className="size-4" />
        Saved
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => reflectionsStore.save(question, answer)}
        className={buttonClass("secondary", "sm", "bg-paper/70")}
        title="Saved only in this browser — nothing is sent to a server"
      >
        <Icon name="bookmark" className="size-4" />
        Save
      </button>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[0.8125rem] text-ok">
        <Icon name="bookmarkCheck" className="size-4" />
        Saved in this browser ·{" "}
        <Link href="/reflections" className="font-medium underline underline-offset-2">
          Your reflections
        </Link>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => reflectionsStore.save(question, answer)}
      className={buttonClass("ghost", "sm")}
      title="Saved only in this browser — nothing is sent to a server"
    >
      <Icon name="bookmark" className="size-4" />
      Save this reflection
    </button>
  );
}
