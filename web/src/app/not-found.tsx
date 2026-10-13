import Link from "next/link";

import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClass } from "@/lib/ui";

export default function NotFound() {
  return (
    <PageContainer width="narrow" className="pt-16 sm:pt-24">
      <EmptyState
        icon="compass"
        headingLevel={1}
        title="This page isn’t here"
        actions={
          <>
            <Link href="/explore" className={buttonClass("primary", "md")}>
              Explore the texts
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href="/" className={buttonClass("secondary", "md")}>
              Ask a question
            </Link>
          </>
        }
      >
        The verse, chapter or theme you were looking for does not exist in the collection. Check the
        reference, or browse from the library.
      </EmptyState>
    </PageContainer>
  );
}
