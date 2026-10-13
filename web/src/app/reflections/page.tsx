import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReflectionsList } from "@/components/ReflectionsList";

export const metadata: Metadata = {
  title: "Your reflections",
  description: "Answers you saved, with your own notes. Stored only in this browser.",
};

export default function ReflectionsPage() {
  return (
    <PageContainer width="medium">
      <PageHeader
        eyebrow="Private to this browser"
        title="Your reflections"
        description="Answers you saved, with room for your own thoughts. They are kept only in this browser — no account, nothing sent to a server. Clearing your browser data removes them, so export anything you want to keep."
      />
      <ReflectionsList />
    </PageContainer>
  );
}
