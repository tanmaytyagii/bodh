"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { ImportReflections } from "@/components/reflections/ImportReflections";
import { downloadReflections } from "@/lib/download";
import { useT } from "@/lib/i18n/useLocale";
import { reflectionsStore } from "@/lib/reflections";
import { useHydrated } from "@/lib/useHydrated";
import { buttonClass } from "@/lib/ui";

export function ReflectionSettings() {
  const hydrated = useHydrated();
  const t = useT();
  const items = useSyncExternalStore(
    reflectionsStore.subscribe,
    () => reflectionsStore.getSnapshot(),
    reflectionsStore.getServerSnapshot,
  );
  const [deleted, setDeleted] = useState<number | null>(null);
  const count = items.length;

  return (
    <div>
      <p className="text-[0.9375rem] text-ink" aria-live="polite">
        {!hydrated ? (
          <T k="reflections.checking" />
        ) : deleted !== null ? (
          <T k={deleted === 1 ? "reflections.deletedAll.one" : "reflections.deletedAll.other"} values={{ count: deleted }} />
        ) : count ? (
          <T k={count === 1 ? "reflections.saved.one" : "reflections.saved.other"} values={{ count }} />
        ) : (
          <T k="reflections.saved.none" />
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/reflections" className={buttonClass("secondary", "sm")}>
          <Icon name="bookmark" className="size-4" />
          <T k="reflections.open" />
        </Link>
        <button
          type="button"
          disabled={!count}
          onClick={() => downloadReflections(items)}
          className={buttonClass("secondary", "sm")}
        >
          <Icon name="download" className="size-4" />
          <T k="reflections.exportAll" />
        </button>
        <ImportReflections />
        <ConfirmButton
          disabled={!count}
          className={buttonClass("danger", "sm")}
          title={t("reflections.deleteAll.title")}
          description={t(count === 1 ? "reflections.deleteAll.body.one" : "reflections.deleteAll.body.other", { count })}
          confirmLabel={t("reflections.deleteAll")}
          onConfirm={() => {
            reflectionsStore.clear();
            setDeleted(count);
          }}
        >
          <Icon name="trash" className="size-4" />
          <T k="reflections.deleteAll" />
        </ConfirmButton>
      </div>
    </div>
  );
}
