import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

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
        eyebrow="Themes"
        title="Paths into the texts, from where you are"
        description={
          <>
            <p className="max-w-2xl">
              Start from what you are going through. Each theme gathers the passages that speak to it, with a short
              summary and the cautions worth keeping in mind.
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <Label kind="editorial" />
              The summaries are the editors’ paraphrase; every quotation in them is checked word-for-word against the
              linked verses.
            </p>
          </>
        }
      />
      <Suspense fallback={<LoadingState label="Loading themes" variant="cards" />}>
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
