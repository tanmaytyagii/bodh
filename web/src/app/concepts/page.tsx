import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { T } from "@/components/i18n/T";
import { Label } from "@/components/Label";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ThemeIndex } from "@/components/ThemeIndex";
import { getConcepts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Themes",
  description: "Life situations and the passages of the Bhagavad Gita and the Upanishads that speak to them.",
};

export default function ConceptsPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow={<T k="nav.themes" />}
        title={<T k="themes.title" />}
        description={
          <>
            <p className="max-w-2xl">
              <T k="themes.lede" />
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <Label kind="editorial" />
              <span>
                <T k="themes.editorial" />
              </span>
            </p>
          </>
        }
      />
      <Suspense fallback={<LoadingState label={<T k="themes.loading" />} variant="cards" />}>
        <Themes />
      </Suspense>
    </PageContainer>
  );
}

async function Themes() {
  await connection();
  const concepts = (await getConcepts()) ?? [];
  return (
    <ThemeIndex
      themes={concepts.map((c) => ({
        id: c.id,
        name: c.name,
        term: c.term,
        summary: c.summary,
        life_situations: c.life_situations,
      }))}
    />
  );
}
