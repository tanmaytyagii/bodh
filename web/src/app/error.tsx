"use client";

import { T } from "@/components/i18n/T";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClass } from "@/lib/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer width="narrow" className="pt-16 sm:pt-24">
      <div role="alert">
        <EmptyState
          icon="alert"
          headingLevel={1}
          title={<T k="pageError.title" />}
          actions={
            <button type="button" onClick={reset} className={buttonClass("primary", "md")}>
              <Icon name="rotateCcw" className="size-4" />
              <T k="composer.tryAgain" />
            </button>
          }
        >
          <T k="pageError.body" />
          {process.env.NODE_ENV !== "production" && (
            <span className="mt-4 block rounded-lg bg-surface-sunk p-3 text-left font-mono text-xs text-ink-muted">
              {error.message}
            </span>
          )}
        </EmptyState>
      </div>
    </PageContainer>
  );
}
