import Link from "next/link";

import { T } from "@/components/i18n/T";
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
        title={<T k="notFound.title" />}
        actions={
          <>
            <Link href="/explore" className={buttonClass("primary", "md")}>
              <T k="notFound.explore" />
              <Icon name="arrowRight" className="size-4" />
            </Link>
            <Link href="/" className={buttonClass("secondary", "md")}>
              <T k="landing.ask" />
            </Link>
          </>
        }
      >
        <T k="notFound.body" />
      </EmptyState>
    </PageContainer>
  );
}
