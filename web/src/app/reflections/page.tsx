import type { Metadata } from "next";

import { T } from "@/components/i18n/T";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReflectionsList } from "@/components/ReflectionsList";

export const metadata: Metadata = {
  title: "Your reflections",
  description: "Answers and passages you saved, with your own notes. Stored only in this browser.",
};

export default function ReflectionsPage() {
  return (
    <PageContainer width="medium">
      <PageHeader
        eyebrow={<T k="reflections.eyebrow" />}
        title={<T k="save.yourReflections" />}
        description={<T k="reflections.description" />}
      />
      <ReflectionsList />
    </PageContainer>
  );
}
