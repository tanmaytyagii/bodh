"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Icon } from "@/components/Icon";
import { downloadReflections } from "@/lib/download";
import { reflectionsStore } from "@/lib/reflections";
import { useHydrated } from "@/lib/useHydrated";
import { buttonClass } from "@/lib/ui";

export function ReflectionSettings() {
  const hydrated = useHydrated();
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  const [status, setStatus] = useState("");
  const count = items.length;

  return (
    <div>
      <p className="text-[0.9375rem] text-ink" aria-live="polite">
        {!hydrated
          ? "Checking this browser…"
          : status ||
            (count
              ? `${count} reflection${count === 1 ? " is" : "s are"} saved in this browser.`
              : "No reflections are saved in this browser.")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/reflections" className={buttonClass("secondary", "sm")}>
          <Icon name="bookmark" className="size-4" />
          Open reflections
        </Link>
        <button
          type="button"
          disabled={!count}
          onClick={() => downloadReflections(items)}
          className={buttonClass("secondary", "sm")}
        >
          <Icon name="download" className="size-4" />
          Export all
        </button>
        <ConfirmButton
          disabled={!count}
          className={buttonClass("danger", "sm")}
          title="Delete all saved reflections?"
          description={`All ${count} saved reflection${count === 1 ? "" : "s"} and your notes will be removed from this browser. This cannot be undone. Export them first if you want to keep a copy.`}
          confirmLabel="Delete all"
          onConfirm={() => {
            reflectionsStore.clear();
            setStatus(`Deleted ${count} saved reflection${count === 1 ? "" : "s"}.`);
          }}
        >
          <Icon name="trash" className="size-4" />
          Delete all
        </ConfirmButton>
      </div>
    </div>
  );
}
