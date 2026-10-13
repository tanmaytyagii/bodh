"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { announceAskNavigation } from "@/lib/askNavigation";

/**
 * A link to the Ask page. From the conversation view it returns to the
 * invitation, where a new question starts (the conversation stays in this
 * tab, one step back in history).
 */
export function AskLink(props: Omit<ComponentProps<typeof Link>, "href" | "onNavigate">) {
  return <Link {...props} href="/" onNavigate={announceAskNavigation} />;
}
